 import Express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { instrument } from "@socket.io/admin-ui";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { projectStatus, toggleProject } from "./project";
import { agentStatus, checkAgentStatus } from "./agent";
import { createConversation, setConversationStatus } from "./conversation";
import { findUser } from "./user";
dotenv.config();

const app = Express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

app.get("/", (_, res) => {
  res.send("res");
});



io.on("connection", async (socket) => {
  console.log("new connection", socket.id, socket.handshake.query);
  if (
    socket.handshake.query.apiKey &&
    //@ts-ignore to solve .trim()
    socket.handshake.query.apiKey.trim() !== ""
  ) {
    //client - join room
    const connectionId = socket.handshake.query.connectionId as string;
    console.log("client");
    
    socket.join(connectionId);
    //emit new connection
    socket
      .to(socket.handshake.query.apiKey!)
      .emit("DingloClient-NewConnection", connectionId);

    //check for project widget availability
    const active = await projectStatus(socket.handshake.query.apiKey as string);
    console.log("here",active);
    
    setTimeout(() => {
      socket.emit("disable_project", { isActive: active });
    }, 500);

    if (active) {
      //check for agent status
      setTimeout(() => {
        checkAgentStatus(io,socket.handshake.query.apiKey as string, socket);
      }, 500);

      //emit to dashboard new connection
      await createConversation(
        connectionId,
        socket.handshake.query.apiKey as string,
        socket
      );
      await setConversationStatus(connectionId, true, socket);
      socket.on("invalidate_query",()=>{
        
        socket.to(socket.handshake.query.apiKey as string).emit("DingloClient-InvalidateQuery");
      })
      socket.on("message", async (message) => {
        const isAvailableAgent = io.sockets.adapter.rooms.has(socket.handshake.query.apiKey as string);
        if(!isAvailableAgent){
          const user = await findUser(socket.handshake.query.apiKey as string);
          if(user) await sendMailNotification(user.email, message.message);

          return;
        }
        socket
        .to(socket.handshake.query.apiKey!)
        .emit("DingloClient-DashboardMessage", {
          ...message,
          conversationId: connectionId,
        });
        
      });

      socket.on("typing", (typing) => {
        socket
          .to(socket.handshake.query.apiKey!)
          .emit("DingloClient-Typing", { ...typing, connectionId });
      });

      socket.on("disconnect", () => {
        setConversationStatus(connectionId, false, socket);
        socket
          .to(socket.handshake.query.apiKey!)
          .emit("DingloClient-Disconnect", connectionId);
      });
    }
  } else {
    //dingloUser - join room api keys
    console.log("admin");
    
    socket.join(socket.handshake.query.id!);

    //emit being online
    setTimeout(() => {
      agentStatus(socket.handshake.query.id as string, socket, true);
    }, 500);

    socket.on("DingloServer-DashboardMessage", async (msg) => {
      console.log(msg)
      
      socket
        .to(msg.connectionId)
        .emit("message_client", { ...msg, isNew: true });
    });

    socket.on("DingloServer-InvalidateQuery",(query)=>{
      socket.to(query.connectionId).emit("invalidate_query");
    })

    socket.on("DingloServer-Typing", (typing) => {
      socket
        .to(typing.conversationId)
        .emit("typing", { isTyping: typing.isTyping });
    });

    socket.on("DingloServer-DeleteMessage", (msg) => {
      socket.to(msg.connectionId).emit("delete_message", msg.id);
    });

    //refresh
    socket.on("DingloServer-AgentChange", () => {
      agentStatus(socket.handshake.query.id as string, socket, true);
    });

    socket.on("disconnect", () => {
      agentStatus(socket.handshake.query.id as string, socket, false);
    });

    socket.on("DingloServer-ProjectStatus", (project) => {
      toggleProject(
        socket.handshake.query.id as string,
        socket,
        !project.isDisabled
      );
    });
  }
});

io.on("disconnect", (socket) => {
  if (socket.handshake.query.id)
    agentStatus(socket.handshake.query.id as string, socket, false);
  else{
    setConversationStatus(socket.handshake.query.connectionId, false, socket);
        socket
          .to(socket.handshake.query.apiKey!)
          .emit("DingloClient-Disconnect", socket.handshake.query.connectionId);
  }
});

httpServer.listen(process.env.PORT, () => {
  console.log("server is listening on port 3001");
});

instrument(io, {
  auth: false,
});



async function sendMailNotification(email: string, message: string) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.NODEMAILER_EMAIL,
      pass: process.env.NODEMAILER_PASSWORD,
    },
  });
  const mailOptions = {
    from: "dingloadmindingo@gmail.com",
    to: email,
    subject: "Dinglo.IO - New message while you are offline",
    text:message,
  };
  await transporter.sendMail(mailOptions);
}