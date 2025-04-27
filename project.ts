import db from "./db";
import { Socket } from "socket.io";

export async function findProject(projectApiKey: string) {
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

export async function toggleProject(
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

export async function projectStatus(projectApiKey: string) {
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