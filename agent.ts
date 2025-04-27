import { Socket } from "socket.io";
import db from "./db";
import { findProject } from "./project";

export async function agentStatus(
  projectApiKey: string,
  socket: Socket,
  available: boolean
) {
  try {
    const user = await db.user.findFirst({
      where: {
        projects: {
          some: {
            api_key: projectApiKey,
          },
        },
      },
    });

    if (!user) return;

    const targetProject = await findProject(projectApiKey);

    if (!targetProject) return;

    //emit to all conversations that there is an available agent
    const projectConversations = await db.conversation.findMany({
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
  } catch (err) {
    console.log(err);
  }
}

export async function checkAgentStatus(io: any,projectApiKey: string, socket: Socket) {
    try {
      const targetProject = await findProject(projectApiKey);
      if (!targetProject) return;
  
      const isAvailableAgent = io.sockets.adapter.rooms.has(projectApiKey);
  
      if (isAvailableAgent){
        socket.emit("available_agent", {
          available: isAvailableAgent,
          agentName: targetProject.agentName,
          agentImage: targetProject.agentImage,
        });
        
      }
    
    } catch (err) {
      setTimeout(() => {
        socket.emit("disable_project", { isActive: false });
      }, 500);
      console.log(err);
    }
  }