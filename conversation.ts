import { Socket } from "socket.io";
import db from "./db";
import { findProject } from "./project";

export async function createConversation(
  connectionId: string,
  projectApiKey: string,
  socket: Socket
) {
  try {
    const targetProject = await findProject(projectApiKey);
    if (!targetProject) return;

    const alreadyExists = await db.conversation.findUnique({
      where: {
        projectId: targetProject.id,
        connectionId,
      },
    });
    if (!alreadyExists)
      await db.conversation.create({
        data: {
          connectionId: connectionId,
          projectId: targetProject.id,
        },
      });
  } catch (err) {
    setTimeout(() => {
      socket.emit("disable_project", { isActive: false });
    }, 500);
  }
}
export async function setConversationStatus(
  connectionId: string,
  status: boolean,
  socket: Socket
) {
  //status - true ? online:false
  try {
    await db.conversation.update({
      where: {
        connectionId,
      },
      data: {
        online: status,
      },
    });
  } catch (err) {
    setTimeout(() => {
      socket.emit("disable_project", { isActive: false });
    }, 500);
    console.log(err);
  }
}