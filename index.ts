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
async function setConversationStatus(connectionId: string, status: boolean){
    //status - true ? online:false
    try{

        await db.conversation.update({
            where:{
                connectionId,
            },
            data:{
                online: status,
            }
        })
    }catch(err){
        console.log(err);
    }
}

async function agentStatus(projectApiKey: string, socket: Socket, available: boolean){
    try{

        const user = await db.user.findFirst({
            where:{
                projects: {
                    some: {
                      api_key:projectApiKey,
                    },
                },
            }
        });
        
        if(!user) return;


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
        console.log(projectConversations);
        

        if(projectConversations)
            for(const conv of projectConversations){
                socket.to(conv.connectionId).emit("available_agent",{available, agentName: user.username, agentImage:"/profile.jpg"});
            }
    }catch(err){
        console.log(err);
    }
}

async function checkAgentStatus(projectApiKey: string, socket: Socket){
    try{
        const user = await db.user.findFirst({
            where:{
                projects: {
                    some: {
                      api_key:projectApiKey,
                    },
                },
            }
        });

        if(!user) return;
        const isAvailableAgent = io.sockets.adapter.rooms.has(projectApiKey);

        socket.emit("available_agent",{available: isAvailableAgent, agentName: user.username, agentImage:"/profile.jpg"});
        
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
        console.log("cids", connectionId);
        setConversationStatus(connectionId, true);

        socket.join(connectionId);

        //check for agent status
        setTimeout(()=>{
            checkAgentStatus(socket.handshake.query.apiKey as string, socket);
        },500);

        //send the previous messages
        setTimeout(()=>{
            // give some to socket to initialize
            sendConnectionMessages(connectionId, socket);
        },500);

        //emit to dashboard new connection
        createConversation(connectionId, socket.handshake.query.apiKey as string);
        socket.to(socket.handshake.query.apiKey!).emit("DingloClient-NewConnection",connectionId);

        socket.on("message", (message)=>{
            //save message to db
            saveMessage(message.message,connectionId,socket.handshake.query.apiKey as string,false);
            socket.to(socket.handshake.query.apiKey!).emit("DingloClient-DashboardMessage", {...message, connectionId});
        });

        socket.on("typing",(typing)=>{
            console.log(typing);
            
            socket.to(socket.handshake.query.apiKey!).emit("DingloClient-Typing",{...typing, connectionId});
        });

        socket.on("disconnect",()=>{
            console.log("widget cline disconnected");
            
            socket.to(socket.handshake.query.apiKey!).emit("DingloClient-Disconnect",connectionId);
            setConversationStatus(connectionId, false);
        });

    }else{
        //dingloUser - join room api key
        console.log("dinglo user", socket.handshake.query.id);
        
        socket.join(socket.handshake.query.id!);

        //emit being online
        setTimeout(()=>{
            agentStatus(socket.handshake.query.id as string, socket, true);
        },500);

        socket.on("DingloServer-DashboardMessage",(msg)=>{
            saveMessage(msg.message,msg.connectionId,socket.handshake.query.id as string,true);
            socket.to(msg.connectionId).emit("message_client",{...msg, isNew: true});
        });
        socket.on("DingloServer-Typing",(typing)=>{
            socket.to(typing.chatId).emit("typing",{isTyping: typing.isTyping});
        })

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