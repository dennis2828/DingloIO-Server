import Express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { instrument } from "@socket.io/admin-ui";
import nodemailer from "nodemailer";
import db from "./db";

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

async function createConversation(
  connectionId: string,
  projectApiKey: string,
  socket: Socket
) {
  try {
    const targetProject = await findProject(projectApiKey);
    if (!targetProject) return;

    const alreadyExists = await db.conversation.findUnique({
      where: {
        projectId: targetProject.id,
        connectionId,
      },
    });
    if (!alreadyExists)
      await db.conversation.create({
        data: {
          connectionId: connectionId,
          projectId: targetProject.id,
        },
      });
  } catch (err) {
    setTimeout(() => {
      socket.emit("disable_project", { isActive: false });
    }, 500);
  }
}
async function setConversationStatus(
  connectionId: string,
  status: boolean,
  socket: Socket
) {
  //status - true ? online:false
  try {
    await db.conversation.update({
      where: {
        connectionId,
      },
      data: {
        online: status,
      },
    });
  } catch (err) {
    setTimeout(() => {
      socket.emit("disable_project", { isActive: false });
    }, 500);
    console.log(err);
  }
}

async function agentStatus(
  projectApiKey: string,
  socket: Socket,
  available: boolean
) {
  try {
    const user = await db.user.findFirst({
      where: {
        projects: {
          some: {
            api_key: projectApiKey,
          },
        },
      },
    });

    if (!user) return;

    const targetProject = await findProject(projectApiKey);

    if (!targetProject) return;

    //emit to all conversations that there is an available agent
    const projectConversations = await db.conversation.findMany({
      where: {
        projectId: targetProject.id,
      },
    });

    if (projectConversations)
      for (const conv of projectConversations) {
        socket.to(conv.connectionId).emit("available_agent", {
          available,
          agentName: targetProject.agentName,
          agentImage: targetProject.agentImage,
        });
      }
  } catch (err) {
    console.log(err);
  }
}

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

async function checkAgentStatus(projectApiKey: string, socket: Socket) {
  try {
    const targetProject = await findProject(projectApiKey);
    if (!targetProject) return;

    const isAvailableAgent = io.sockets.adapter.rooms.has(projectApiKey);

    if (isAvailableAgent){
      socket.emit("available_agent", {
        available: isAvailableAgent,
        agentName: targetProject.agentName,
        agentImage: targetProject.agentImage,
      });
      
    }
  
  } catch (err) {
    setTimeout(() => {
      socket.emit("disable_project", { isActive: false });
    }, 500);
    console.log(err);
  }
}

async function findProject(projectApiKey: string) {
  try {
    const targetProject = await db.project.findUnique({
      where: {
        api_key: projectApiKey,
      },
      include:{
        predefinedAnswers: true,
      },
    });

    return targetProject;
  } catch (err) {
    return false;
  }
}

async function findUser(projectApiKey: string){
  try {
    const targetProject = await findProject(projectApiKey);

    if(!targetProject) return;

    const user = await db.user.findUnique({
      where:{
        id: targetProject.userId,
      },
    });
    if(!user) return;

    return user;

  } catch (err) {
    return false;
  }
}

async function toggleProject(
  projectApiKey: string,
  socket: Socket,
  status: boolean
) {
  try {
    const targetProject = await db.project.update({
      where: {
        api_key: projectApiKey,
      },
      data: {
        disabled: status,
      },
    });

    //emit to all connections
    const projectConversations = await db.conversation.findMany({
      where: {
        projectId: targetProject.id,
      },
    });

    if (projectConversations)
      for (const conv of projectConversations) {
        socket
          .to(conv.connectionId)
          .emit("disable_project", { isActive: !status });
      }
    socket.emit("DingloClient-ProjectDisabled", { isDisabled: !status });
  } catch (err) {
    return false;
  }
}

async function projectStatus(projectApiKey: string) {
  try {
    const targetProject = await db.project.findUnique({
      where: {
        api_key: projectApiKey,
      },
    });

    if (!targetProject) return false;

    return !targetProject.disabled;
  } catch (err) {
    return false;
  }
}


io.on("connection", async (socket) => {
  console.log("new connection", socket.id, socket.handshake.query);
  if (
    socket.handshake.query.apiKey &&
    //@ts-ignore to solve .trim()
    socket.handshake.query.apiKey.trim() !== ""
  ) {
    //client - join room
    const connectionId = socket.handshake.query.connectionId as string;

    socket.join(connectionId);
    //emit new connection
    socket
      .to(socket.handshake.query.apiKey!)
      .emit("DingloClient-NewConnection", connectionId);

    //check for project widget availability
    const active = await projectStatus(socket.handshake.query.apiKey as string);
    setTimeout(() => {
      socket.emit("disable_project", { isActive: active });
    }, 500);

    if (active) {
      //check for agent status
      setTimeout(() => {
        checkAgentStatus(socket.handshake.query.apiKey as string, socket);
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
    socket.join(socket.handshake.query.id!);

    //emit being online
    setTimeout(() => {
      agentStatus(socket.handshake.query.id as string, socket, true);
    }, 500);

    socket.on("DingloServer-DashboardMessage", async (msg) => {
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

httpServer.listen(3001, () => {
  console.log("server is listening on port 3001");
});

instrument(io, {
  auth: false,
});
