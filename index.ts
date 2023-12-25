import Express from "express";
import {createServer} from "http";
import {Server} from "socket.io";
import { instrument } from "@socket.io/admin-ui";
import db from "./db";

const app = Express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors:{
        origin:"*",
    },
});

app.get("/",(_, res)=>{
    res.send("re");
});

async function saveMessage(message: string, connectionId: string, apiKey: string, isAgent: boolean){
  
    //find project to update
    const targetProject = await db.project.findUnique({
        where:{
            api_key: apiKey,
        },
    });
    if(!targetProject) return;

   const conversationExists = await db.conversation.findUnique({
    where:{
        connectionId,
    },
   });

   if(!conversationExists){
    //create conversation
    await db.conversation.create({
        data:{
            connectionId,
            projectId: targetProject.id,
        },
    });
    await db.message.create({
        data:{
            message,
            isAgent,
            messagedAt: new Date(Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            conversationId: connectionId,
        },
    });
   }else{
    //update conversation
    await db.message.create({
        data:{
            message,
            isAgent,
            messagedAt: new Date(Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            conversationId: connectionId,
        },
    })
   }
}

io.on("connection",(socket)=>{
    console.log("new connection", socket.id, socket.handshake.query);
    //@ts-ignore to solve .trim()
    if(socket.handshake.query.apiKey && socket.handshake.query.apiKey.trim()!==""){
        //client - join room
        const connectionId = socket.handshake.query.connectionId as string;
        console.log("cid", connectionId);
        
        socket.join(connectionId);
        
        socket.on("message", (message)=>{
            //save message to db
            saveMessage(message.message,connectionId,socket.handshake.query.apiKey as string,false);
            socket.to(socket.handshake.query.apiKey!).emit("DingloClient-DashboardMessage", {...message, connectionId});
            socket.emit("message_client",message);
        });
    }else{
        //dingloUser - join room api key
        console.log("dinglo user", socket.handshake.query.id);
        
        socket.join(socket.handshake.query.id!);
        
        socket.on("DingloServer-DashboardMessage",(msg)=>{
            saveMessage(msg.message,msg.connectionId,socket.handshake.query.id as string,true);
            socket.to(msg.connectionId).emit("message_client",msg);
        })
    }
    
});

io.on("disconnect",(socket)=>{
    console.log("disconnect");
    
    console.log("disconnect", socket.id);
    
});


httpServer.listen(3001,()=>{
    console.log("server is listening on port 3001");
    
});

instrument(io,{
    auth:false,
});