import Express from "express";
import {createServer} from "http";
import {Server, Socket} from "socket.io";
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

async function getConnectionMessages(connectionId: string){
    const messages = await db.message.findMany({
        where:{
            conversationId: connectionId,
        },
    });

    if(!messages) return [];

    return messages;
}

async function sendConnectionMessages(connectionId: string, socket: Socket){
    const connectionMessages = await getConnectionMessages(connectionId);

    for(const cn of connectionMessages){
        socket.emit("message_client",{isAgent: cn.isAgent, message: cn.message, messagedAt: cn.messagedAt, isNew: false});
    }
}

async function createConversation(connectionId: string, projectApiKey: string){
    try{
        const targetProject = await db.project.findUnique({
            where:{
                api_key: projectApiKey,
            },
        });
        if(!targetProject) return;

        //check already exists
        const alreadyExists = await db.conversation.findUnique({
            where:{
                connectionId,
            },
        });
        if(!alreadyExists)
            await db.conversation.create({
                data:{
                    connectionId: connectionId,
                    projectId: targetProject.id,
                },
            });

    }catch(err){
        console.log(err);
    }
}

async function agentStatus(projectApiKey: string, socket: Socket, available: boolean){
    try{
        const targetProject = await db.project.findUnique({
            where:{
                api_key: projectApiKey,
            },
        });

        if(!targetProject) return;

        //emit to all conversations that there is an available agent
        const projectConversations = await db.conversation.findMany({
            where:{
                projectId: targetProject.id,
            },
        });

        if(projectConversations)
            for(const conv of projectConversations){
                socket.to(conv.connectionId).emit("available_agent",available);
            }
    }catch(err){
        console.log(err);
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
        
        //send the previous messages
        setTimeout(()=>{
            // give some to socket to initialize
            sendConnectionMessages(connectionId, socket);
        },500);

        //emit to dashboard new connection
        createConversation(connectionId, socket.handshake.query.apiKey as string);
        socket.to(socket.handshake.query.apiKey!).emit("DingloClient-NewConnection",connectionId);

        //online/offline agent
        const isAvailableAgent = io.sockets.adapter.rooms.has(socket.handshake.query.apiKey as string);
        setTimeout(()=>{
            socket.emit("available_agent",isAvailableAgent);
        },500);

        socket.on("message", (message)=>{
            //save message to db
            saveMessage(message.message,connectionId,socket.handshake.query.apiKey as string,false);
            socket.to(socket.handshake.query.apiKey!).emit("DingloClient-DashboardMessage", {...message, connectionId});
        });
    }else{
        //dingloUser - join room api key
        console.log("dinglo user", socket.handshake.query.id);
        
        socket.join(socket.handshake.query.id!);

        //emit being online
        agentStatus(socket.handshake.query.id as string, socket, true);

        socket.on("DingloServer-DashboardMessage",(msg)=>{
            saveMessage(msg.message,msg.connectionId,socket.handshake.query.id as string,true);
            socket.to(msg.connectionId).emit("message_client",{...msg, isNew: true});
        });
        socket.on("disconnect",()=>{
            console.log("disconnect");
            agentStatus(socket.handshake.query.id as string, socket, false);
        });
    }
    
});

io.on("disconnect",(socket)=>{
    console.log("disconnect");
    if(socket.handshake.query.id)
        agentStatus(socket.handshake.query.id as string, socket, false);

    console.log("disconnect", socket.id);
});


httpServer.listen(3001,()=>{
    console.log("server is listening on port 3001");
    
});

instrument(io,{
    auth:false,
});