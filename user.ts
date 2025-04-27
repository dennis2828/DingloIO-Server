import db from "./db";
import { findProject } from "./project";

export async function findUser(projectApiKey: string){
    try {
      const targetProject = await findProject(projectApiKey);
  
      if(!targetProject) return;
  
      const user = await db.user.findUnique({
        where:{
          id: targetProject.userId,
        },
      });
      if(!user) return;
  
      return user;
  
    } catch (err) {
      return false;
    }
  }