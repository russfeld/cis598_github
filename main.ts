export async function makeProjects(inputfile: string): Promise<void> {
  const input = Deno.readTextFileSync(inputfile).split("\n");
  const users: string[][] = input.map((line) => line.split(","));
  const organization: string = Deno.env.get("GITHUB_ORGANIZATION") || "undefined";
  const organization_id: string = await getOrganizationId(organization);
  console.log("Using organization_id: " + organization_id);
  await users.forEach(async (user) => {
    console.log("Creating project for " + user[0])
    try {
      const user_id: string = await getUserId(user[1]);
      console.log("Github User ID for " + user[1] + " is " + user_id);
      const repository_name: string = Deno.env.get("GITHUB_ASSIGNMENT_PREFIX") + "-" + user[1];
      const repository_id: string = await getRepository(organization, repository_name);
      console.log("Repository ID for " + repository_name + " is " + repository_id);
      const project_id: string = await createProject(user[0], organization_id, repository_id);
      console.log("Project ID for " + user[0] + " is " + project_id);
      const collab_count: string = await addCollaboratorToProject(project_id, user_id)
      console.log("Project now has " + collab_count + " collaborators");
    } catch (error) {
      console.log("Error creating project for " + user[0]);
      console.log(error);
    }
  });
  return;
}

export async function createProject(title: string, owner: string, repository: string): Promise<string> {
  const mutation: string = `mutation {
    createProjectV2(input: {title: "${title}", ownerId: "${owner}", repositoryId: "${repository}"}) {
      projectV2 {
        id
      }
    }
  }`;
  const response = await githubGraphQuery(mutation);
  console.log(response);
  return response.data.createProjectV2.projectV2.id;
}

export async function addCollaboratorToProject(project: string, user: string): Promise<string> {
  const mutation: string = `mutation {
    updateProjectV2Collaborators(input: {projectId: "${project}", collaborators: [
    {
      role: ADMIN
      userId: "${user}"
    }]}) {
      collaborators {
        totalCount
      }
    }
  }`;
  const response = await githubGraphQuery(mutation);
  return response.data.updateProjectV2Collaborators.collaborators.totalCount;
}

export async function getRepository(organization: string, repository: string): Promise<string> {
  const query: string = `{
    repository(owner: "${organization}", name: "${repository}") {
      id
    }
  }`;
  const response = await githubGraphQuery(query);
  return response.data.repository.id;
}


export async function getUserId(username: string): Promise<string> {
  const query: string = `{
        user(login: "${username}") {
          id
        }
      }`;
  const response = await githubGraphQuery(query);
  return response.data.user.id;
}


export async function getOrganizationId(organization: string): Promise<string> {
  const query: string = `{
        organization(login: "${organization}") {
          id
        }
      }`;
  const response = await githubGraphQuery(query);
  return response.data.organization.id;
}

export async function githubGraphQuery(query: string): Promise<any> {
  const url: string = Deno.env.get("GITHUB_API_URL") || "undefined";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + Deno.env.get("GITHUB_TOKEN"),
      "X-Github-Next-Global-ID": "1"
    },
    body: JSON.stringify({
      query: query
    })
  });
  const data = await response.json();
  return data;
}

if (import.meta.main) {
  makeProjects("inputfile.txt");
}
