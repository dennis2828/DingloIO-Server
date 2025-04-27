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
exports.projectStatus = exports.toggleProject = exports.findProject = void 0;
const db_1 = __importDefault(require("./db"));
function findProject(projectApiKey) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const targetProject = yield db_1.default.project.findUnique({
                where: {
                    api_key: projectApiKey,
                },
                include: {
                    predefinedAnswers: true,
                },
            });
            return targetProject;
        }
        catch (err) {
            return false;
        }
    });
}
exports.findProject = findProject;
function toggleProject(projectApiKey, socket, status) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const targetProject = yield db_1.default.project.update({
                where: {
                    api_key: projectApiKey,
                },
                data: {
                    disabled: status,
                },
            });
            //emit to all connections
            const projectConversations = yield db_1.default.conversation.findMany({
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
        }
        catch (err) {
            return false;
        }
    });
}
exports.toggleProject = toggleProject;
function projectStatus(projectApiKey) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const targetProject = yield db_1.default.project.findUnique({
                where: {
                    api_key: projectApiKey,
                },
            });
            if (!targetProject)
                return false;
            return !targetProject.disabled;
        }
        catch (err) {
            return false;
        }
    });
}
exports.projectStatus = projectStatus;
