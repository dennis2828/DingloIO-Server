"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const admin_ui_1 = require("@socket.io/admin-ui");
const nodemailer_1 = __importDefault(require("nodemailer"));
const dotenv_1 = __importDefault(require("dotenv"));
const project_1 = require("./project");
const agent_1 = require("./agent");
const conversation_1 = require("./conversation");
const user_1 = require("./user");
dotenv_1.default.config();
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*",
    },
});
app.get("/", (_, res) => {
    res.send("res");
});
io.on("connection", (socket) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("new connection", socket.id, socket.handshake.query);
    if (socket.handshake.query.apiKey &&
        //@ts-ignore to solve .trim()
        socket.handshake.query.apiKey.trim() !== "") {
        //client - join room
        const connectionId = socket.handshake.query.connectionId;
        console.log("client");
        socket.join(connectionId);
        //emit new connection
        socket
            .to(socket.handshake.query.apiKey)
            .emit("DingloClient-NewConnection", connectionId);
        //check for project widget availability
        const active = yield (0, project_1.projectStatus)(socket.handshake.query.apiKey);
        console.log("here", active);
        setTimeout(() => {
            socket.emit("disable_project", { isActive: active });
        }, 500);
        if (active) {
            //check for agent status
            setTimeout(() => {
                (0, agent_1.checkAgentStatus)(io, socket.handshake.query.apiKey, socket);
            }, 500);
            //emit to dashboard new connection
            yield (0, conversation_1.createConversation)(connectionId, socket.handshake.query.apiKey, socket);
            yield (0, conversation_1.setConversationStatus)(connectionId, true, socket);
            socket.on("invalidate_query", () => {
                socket.to(socket.handshake.query.apiKey).emit("DingloClient-InvalidateQuery");
            });
            socket.on("message", (message) => __awaiter(void 0, void 0, void 0, function* () {
                const isAvailableAgent = io.sockets.adapter.rooms.has(socket.handshake.query.apiKey);
                if (!isAvailableAgent) {
                    const user = yield (0, user_1.findUser)(socket.handshake.query.apiKey);
                    if (user)
                        yield sendMailNotification(user.email, message.message);
                    return;
                }
                socket
                    .to(socket.handshake.query.apiKey)
                    .emit("DingloClient-DashboardMessage", Object.assign(Object.assign({}, message), { conversationId: connectionId }));
            }));
            socket.on("typing", (typing) => {
                socket
                    .to(socket.handshake.query.apiKey)
                    .emit("DingloClient-Typing", Object.assign(Object.assign({}, typing), { connectionId }));
            });
            socket.on("disconnect", () => {
                (0, conversation_1.setConversationStatus)(connectionId, false, socket);
                socket
                    .to(socket.handshake.query.apiKey)
                    .emit("DingloClient-Disconnect", connectionId);
            });
        }
    }
    else {
        //dingloUser - join room api keys
        console.log("admin");
        socket.join(socket.handshake.query.id);
        //emit being online
        setTimeout(() => {
            (0, agent_1.agentStatus)(socket.handshake.query.id, socket, true);
        }, 500);
        socket.on("DingloServer-DashboardMessage", (msg) => __awaiter(void 0, void 0, void 0, function* () {
            console.log(msg);
            socket
                .to(msg.connectionId)
                .emit("message_client", Object.assign(Object.assign({}, msg), { isNew: true }));
        }));
        socket.on("DingloServer-InvalidateQuery", (query) => {
            socket.to(query.connectionId).emit("invalidate_query");
        });
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
            (0, agent_1.agentStatus)(socket.handshake.query.id, socket, true);
        });
        socket.on("disconnect", () => {
            (0, agent_1.agentStatus)(socket.handshake.query.id, socket, false);
        });
        socket.on("DingloServer-ProjectStatus", (project) => {
            (0, project_1.toggleProject)(socket.handshake.query.id, socket, !project.isDisabled);
        });
    }
}));
io.on("disconnect", (socket) => {
    if (socket.handshake.query.id)
        (0, agent_1.agentStatus)(socket.handshake.query.id, socket, false);
    else {
        (0, conversation_1.setConversationStatus)(socket.handshake.query.connectionId, false, socket);
        socket
            .to(socket.handshake.query.apiKey)
            .emit("DingloClient-Disconnect", socket.handshake.query.connectionId);
    }
});
httpServer.listen(3001, () => {
    console.log("server is listening on port 3001");
});
(0, admin_ui_1.instrument)(io, {
    auth: false,
});
function sendMailNotification(email, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const transporter = nodemailer_1.default.createTransport({
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
            text: message,
        };
        yield transporter.sendMail(mailOptions);
    });
}
