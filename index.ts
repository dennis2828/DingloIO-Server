import Express from "express";
import {createServer} from "http";
import {Server} from "socket.io";
import { instrument } from "@socket.io/admin-ui";

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

io.on("connection",(socket)=>{
    console.log("new connection", socket.id, socket.handshake.query);
    //@ts-ignore to solve .trim()
    if(socket.handshake.query.apiKey && socket.handshake.query.apiKey.trim()!==""){
        //client - join room
        const connectionId = socket.handshake.query.connectionId as string;
        console.log("cid", connectionId);
        
        socket.join(connectionId);
        
        socket.on("message", (message)=>{
            socket.to(socket.handshake.query.apiKey!).emit("DingloClient-DashboardMessage", {...message, connectionId});
            socket.emit("message_client",message);
        });
    }else{
        //dingloUser - join room api key
        console.log("dinglo user", socket.handshake.query.id);
        
        socket.join(socket.handshake.query.id!);
        
        socket.on("DingloServer-DashboardMessage",(msg)=>{
            console.log("message de la client", msg);
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