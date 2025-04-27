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
exports.checkAgentStatus = exports.agentStatus = void 0;
const db_1 = __importDefault(require("./db"));
const project_1 = require("./project");
function agentStatus(projectApiKey, socket, available) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield db_1.default.user.findFirst({
                where: {
                    projects: {
                        some: {
                            api_key: projectApiKey,
                        },
                    },
                },
            });
            if (!user)
                return;
            const targetProject = yield (0, project_1.findProject)(projectApiKey);
            if (!targetProject)
                return;
            //emit to all conversations that there is an available agent
            const projectConversations = yield db_1.default.conversation.findMany({
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
        }
        catch (err) {
            console.log(err);
        }
    });
}
exports.agentStatus = agentStatus;
function checkAgentStatus(io, projectApiKey, socket) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const targetProject = yield (0, project_1.findProject)(projectApiKey);
            if (!targetProject)
                return;
            const isAvailableAgent = io.sockets.adapter.rooms.has(projectApiKey);
            if (isAvailableAgent) {
                socket.emit("available_agent", {
                    available: isAvailableAgent,
                    agentName: targetProject.agentName,
                    agentImage: targetProject.agentImage,
                });
            }
        }
        catch (err) {
            setTimeout(() => {
                socket.emit("disable_project", { isActive: false });
            }, 500);
            console.log(err);
        }
    });
}
exports.checkAgentStatus = checkAgentStatus;
