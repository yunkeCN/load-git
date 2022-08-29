import * as fs from 'fs-extra';
import { getBranchLastCommitId, getUrlConfig, isBranchExist } from "./git";

const download = require('download-git-repo');
const rmrf = require('rmrf');

const CACHE_DIR = `${process.cwd()}/.load-git-cache`;

const loadPromiseMap: { [gitAndBranch: string]: Promise<LoadRes> } = {};

function getDirNameForArchiveUrl(archiveUrl: string): string {
  return archiveUrl
    .replace(/^git@/, '')
    .replace(/^https?:\/\//, '')
    .replace(/.git$/, '')
    .replace(/:/, '/')
    .replace(/\/repository\/.+$/, '');
}

export interface GitConfig {
  url: string;
  branch?: string;
  accessToken?: string;
}

export interface LoadRes {
  parentDir: string;
  path: string;
}

export async function load(opt: GitConfig): Promise<LoadRes> {
  const { url, accessToken } = opt;
  let { branch = "master" } = opt;

  const promiseKey = `${url}-${branch}`;

  const promise = loadPromiseMap[promiseKey];
  if (promise) {
    return promise;
  }

  let parentDir: string = '';
  try {
    let branchLastCommitId;
    try {
      branchLastCommitId = await getBranchLastCommitId(url, branch, accessToken);
    } catch (e: any) {
      if (e.statusCode === 404 && branch !== 'master') {
        const branchNotExist = await isBranchExist(url, branch, accessToken);
        if (!branchNotExist) {
          // 分支不存在，则从主干分支获取
          branch = process.env.branch || 'master';
          branchLastCommitId = await getBranchLastCommitId(url, branch, accessToken);
        } else {
          throw e;
        }
      }
    }

    const { host, repId } = getUrlConfig(url);

    parentDir = `${CACHE_DIR}/${branchLastCommitId}`;

    const dirName = getDirNameForArchiveUrl(url);
    let targetPath = `${parentDir}/${dirName}`;
    if (!fs.existsSync(parentDir)) {
      await new Promise((resolve, reject) => {
        download(
          `direct:https://${host}/api/v4/projects/${encodeURIComponent(repId)}/repository/archive?sha=${branch}`,
          targetPath,
          { headers: { 'PRIVATE-TOKEN': accessToken } },
          (err: Error | undefined) => {
            if (err) {
              reject(err);
            } else {
              resolve(null);
            }
          },
        );
      });
      delete loadPromiseMap[promiseKey];
      return { parentDir, path: targetPath };
    } else {
      delete loadPromiseMap[promiseKey];
      return { parentDir, path: targetPath };
    }
  } catch (e) {
    if (parentDir) {
      rmrf(parentDir);
    }
    delete loadPromiseMap[promiseKey];
    throw e;
  }
}
