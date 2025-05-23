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
exports.setConversationStatus = exports.createConversation = void 0;
const db_1 = __importDefault(require("./db"));
const project_1 = require("./project");
function createConversation(connectionId, projectApiKey, socket) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const targetProject = yield (0, project_1.findProject)(projectApiKey);
            if (!targetProject)
                return;
            const alreadyExists = yield db_1.default.conversation.findUnique({
                where: {
                    projectId: targetProject.id,
                    connectionId,
                },
            });
            if (!alreadyExists)
                yield db_1.default.conversation.create({
                    data: {
                        connectionId: connectionId,
                        projectId: targetProject.id,
                    },
                });
        }
        catch (err) {
            setTimeout(() => {
                socket.emit("disable_project", { isActive: false });
            }, 500);
        }
    });
}
exports.createConversation = createConversation;
function setConversationStatus(connectionId, status, socket) {
    return __awaiter(this, void 0, void 0, function* () {
        //status - true ? online:false
        try {
            yield db_1.default.conversation.update({
                where: {
                    connectionId,
                },
                data: {
                    online: status,
                },
            });
        }
        catch (err) {
            setTimeout(() => {
                socket.emit("disable_project", { isActive: false });
            }, 500);
            console.log(err);
        }
    });
}
exports.setConversationStatus = setConversationStatus;
