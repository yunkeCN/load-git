import * as request from "request-promise-native";

const gitHttpReg = /https?:\/\/([^/]+)\/(.+)\.git/;
const gitSshReg = /git@([^:]+):(.+)\.git/;

export function getUrlConfig(gitUrl: string): { host: string, repId: string } {
  let host = '';
  let repId = '';

  let exec = gitHttpReg.exec(gitUrl);
  if (exec) {
    host = exec[1];
    repId = exec[2];
  }

  if (!exec) {
    exec = gitSshReg.exec(gitUrl);

    if (exec) {
      host = exec[1];
      repId = exec[2];
    }
  }

  if (exec) {
    return { host, repId };
  }
  throw new Error(`Git url not supported yet: ${gitUrl}`);
}

export async function getBranchLastCommitId(gitUrl: string, branch: string, accessToken?: string): Promise<string> {
  const config = getUrlConfig(gitUrl);

  const { host, repId } = config;

  const uri = `https://${host}/api/v4/projects/${encodeURIComponent(repId)}/repository/branches/${branch}`;

  const res = await request({
    uri,
    qs: { private_token: accessToken },
    json: true,
  });
  return res.commit.id;
}

export async function isBranchExist(gitUrl: string, branch: string, accessToken?: string): Promise<boolean> {
  const config = getUrlConfig(gitUrl);

  const { host, repId } = config;

  const uri = `https://${host}/api/v4/projects/${encodeURIComponent(repId)}/repository/branches`;

  const res: any[] = await request({
    uri,
    qs: { private_token: accessToken },
    json: true,
  });
  return !!res.find((item) => item.name === branch);
}
