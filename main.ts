/**
 * This is the main method that does the work of creating projects for users.
 * 
 * Environment variables used:
 * - GITHUB_API_URL: The GitHub GraphQL API URL
 * - GITHUB_TOKEN: A GitHub token with appropriate permissions (admin:org, admin:org_hook, project, repo)
 * - GITHUB_ORGANIZATION: The GitHub organization to create projects in (e.g. ksu-cs-projects-2025-2026)
 * - GITHUB_ASSIGNMENT_PREFIX: The prefix to use for repository names (e.g. "spring-2026" for "spring-2026-github_username" repos)
 * - GITHUB_PROJECT_TEMPLATE_NUMBER: The project number of the template project to copy from (e.g. "1" for the first project in the organization)
 * 
 * @param inputfile a file path to a text file containing a
 * list of users in the format "eID,github_username" one per line
 */

export async function makeProjects(inputfile: string): Promise<void> {
  // Step 1: Read the input file and parse the users
  const input = Deno.readTextFileSync(inputfile).split("\n");
  const users: string[][] = input.map((line) => line.split(","));

  // Step 2: Get organization ID and template project ID
  const organization: string = Deno.env.get("GITHUB_ORGANIZATION") || "undefined";
  const organization_id: string = await getOrganizationId(organization);
  console.log("Using organization_id: " + organization_id);

  // Step 3: Find the template project ID
  const template_number: string = Deno.env.get("GITHUB_PROJECT_TEMPLATE_NUMBER") || "undefined";
  const template_info: [string, string] = await getTemplateProjectId(organization, template_number);
  console.log("Using template_id: " + template_info[0] + " with name: " + template_info[1]);

  // Step 4: For each user, create a project, link to repository, and add collaborator
  await users.forEach(async (user) => {
    console.log("Creating project for " + user[0])
    try {
      // Step 4a: Get user ID
      const user_id: string = await getUserId(user[1]);
      console.log("\tGithub User ID for " + user[1] + " is " + user_id);

      // Step 4b: Get repository ID
      const repository_name: string = Deno.env.get("GITHUB_ASSIGNMENT_PREFIX") + "-" + user[1];
      const repository_id: string = await getRepository(organization, repository_name);
      console.log("\tRepository ID for " + repository_name + " is " + repository_id);

      // Step 4c: Create or find project
      // Options:
      // - createProject will create a blank project for the user and link it to the repository in one step
      // - copyProject  will create a project by copying the template project for the user
      //                you must then link the project to the repository in a separate step
      // - findProject  will look for an existing project with the user's eID as the title
      //                use this if you have already created the projects and just need to 
      //                link them to repositories and add collaborators
 
      //const project_id: string = await createProject(user[0], organization_id, repository_id);
      const project_id: string = await copyProject(user[0], organization_id, template_info[0]);
      //const project_id: string = await findProject(user[0], organization);
      console.log("\tFound/Created Project " + project_id + " for " + user[0]);

      // Step 4d: Link project to repository (optional if using createProject)
      // In testing, this sometimes errors out - I'm guessing that the project isn't fully ready yet
      // So I often just run the script again with this step enabled and use `findProject` in step 4c
      await linkProjectToRepository(project_id, repository_id);
      console.log("\tLinked project " + project_id + " to repository " + repository_name);
      
      // Step 4e: Add user as collaborator to project
      const collab_count: string = await addCollaboratorToProject(project_id, user_id)
      console.log("\tProject now has " + collab_count + " collaborators");
    } catch (error) {

      // This will catch and dump errors
      // Generally, you can just re-run the script to fix transient errors
      // Use `console.log` in the methods below to examine errors from the scripts in more detail
      // TODO: improve error handling
      console.log("\tError creating project for " + user[0]);
      console.log(error);
    }
  });
  return;
}

/**
 * Find a project ID based on organization and project number
 * 
 * @param organization the GitHub organization name (e.g. "ksu-cs-projects-2025-2026")
 * @param project_number the project number within the organization (e.g. "1" for the first project)
 * @returns a tuple containing the project ID and project title
 */
export async function getTemplateProjectId(organization: string, project_number: string): Promise<[string, string]> {
  console.log("Getting template project id for project number: " + project_number);
  const query: string = `{
    organization(login: "${organization}") {
      projectV2(number: ${project_number}) {
        id
        title
      }
    }
  }`;
  const response = await githubGraphQuery(query);
  return [response.data.organization.projectV2.id, response.data.organization.projectV2.title];
}

/**
 * Create a blank project and link it to a repository
 * 
 * @param title the title of the project
 * @param owner the owner ID of the project (usually the organization ID)
 * @param repository the repository ID to link the project to
 * @returns the ID of the created project
 */
export async function createProject(title: string, owner: string, repository: string): Promise<string> {
  const mutation: string = `mutation {
    createProjectV2(input: {title: "${title}", ownerId: "${owner}", repositoryId: "${repository}"}) {
      projectV2 {
        id
      }
    }
  }`;
  const response = await githubGraphQuery(mutation);
  return response.data.createProjectV2.projectV2.id;
}

/**
 * Copy a project from a template
 * 
 * @param title the title of the new project
 * @param owner the owner ID of the project (usually the organization ID)
 * @param template_id the ID of the template project to copy
 * @returns the ID of the copied project
 */
export async function copyProject(title: string, owner: string, template_id: string): Promise<string> {
  const mutation: string = `mutation {
    copyProjectV2(input: {title: "${title}", ownerId: "${owner}", projectId: "${template_id}"}) {
      projectV2 {
        id
      }
    }
  }`;
  const response = await githubGraphQuery(mutation);
  return response.data.copyProjectV2.projectV2.id;
}

/**
 * Find the ID of an existing project
 * 
 * @param title the title of the project
 * @param organization the GitHub organization name (e.g. "ksu-cs-projects-2025-2026")
 * @returns the ID of the found project
 */
export async function findProject(title: string, organization: string): Promise<string> {
  const query: string = `{
    organization(login: "${organization}") {
      projectsV2(first: 100, query: "is:open ${title}") {
        nodes {
          id
          title
        }
      }
    }
  }`;
  const response = await githubGraphQuery(query);
  const projects = response.data.organization.projectsV2.nodes;
  for (const project of projects) {
    if (project.title === title) {
      return project.id;
    }
  }
  throw new Error(`Project with title "${title}" not found in organization "${organization}".`);
}

/**
 * Link a project to a repository
 * 
 * @param project the ID of the project
 * @param repository the ID of the repository
 * @returns the ID of the linked repository
 */
export async function linkProjectToRepository(project: string, repository: string): Promise<string> {
  const mutation: string = `mutation {
    linkProjectV2ToRepository(input: {projectId: "${project}", repositoryId: "${repository}"}) {
      repository {
        id
      }
    }
  }`;
  const response = await githubGraphQuery(mutation);
  return response.data.linkProjectV2ToRepository.repository.id;
}

/**
 * Add a collaborator to a project
 * 
 * @param project the ID of the project
 * @param user the ID of the user to add as a collaborator
 * @returns the total count of collaborators after the addition
 */
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

/**
 * Get the ID of a repository
 * 
 * @param organization the GitHub organization name (e.g. "ksu-cs-projects-2025-2026")
 * @param repository the name of the repository
 * @returns the ID of the repository
 */
export async function getRepository(organization: string, repository: string): Promise<string> {
  const query: string = `{
    repository(owner: "${organization}", name: "${repository}") {
      id
    }
  }`;
  const response = await githubGraphQuery(query);
  return response.data.repository.id;
}

/**
 * Get the ID of a user
 * 
 * @param username the GitHub username
 * @returns the ID of the user
 */
export async function getUserId(username: string): Promise<string> {
  const query: string = `{
        user(login: "${username}") {
          id
        }
      }`;
  const response = await githubGraphQuery(query);
  return response.data.user.id;
}

/**
 * Get the ID of an organization
 * 
 * @param organization the GitHub organization name (e.g. "ksu-cs-projects-2025-2026")
 * @returns the ID of the organization
 */
export async function getOrganizationId(organization: string): Promise<string> {
  const query: string = `{
        organization(login: "${organization}") {
          id
        }
      }`;
  const response = await githubGraphQuery(query);
  return response.data.organization.id;
}

/**
 * Send a GraphQL query to the GitHub API
 * 
 * @param query the GraphQL query string
 * @returns the response data
 */
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

/**
 * Main entry point
 */
if (import.meta.main) {
  makeProjects("inputfile.txt");
}
