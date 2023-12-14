import Express from "express";
import {createServer} from "http";
import {Server} from "socket.io";
import { instrument } from "@socket.io/admin-ui";

const app = Express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors:{
        origin:["http://localhost:3000","https://admin.socket.io"],
    },
});

app.get("/",(_, res)=>{
    res.send("re");
});

io.on("connection",(socket)=>{
    console.log("new connection", socket.id);
});
io.on("disconnect",(socket)=>{
    console.log("disconnect", socket.id);
    
})

httpServer.listen(3001);

instrument(io,{
    auth:false,
});