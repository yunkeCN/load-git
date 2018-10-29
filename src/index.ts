import * as fs from 'fs-extra';
import * as mkdirp from 'mkdirp';
import * as path from 'path';
import * as request from 'request';
import * as unzip from 'unzip';
import { promisify } from 'util';
import { v4 } from 'uuid';
import { getArchiveUrl, getBranchLastCommitId } from "./git";

const rmrf = require('rmrf');

const CACHE_DIR = `${process.cwd()}/.load-git-cache`;

const loadPromiseMap: { [gitAndBranch: string]: Promise<LoadRes> } = {};

interface IDownloadRes {
  path: string;
  dir: string;
  url: string;
}

async function download(
    urlStr: string,
    dir: string = `${CACHE_DIR}/${global.Date.now()}_${Math.random()}`,
    accessToken?: string,
): Promise<IDownloadRes> {
  const zipName = urlStr
      .replace(/^https?:\/\//, '')
      .replace(/\/repository\/.+$/, '')
      .replace(/\//g, '_');
  const filePath = `${dir}/${zipName}.zip`;

  await new Promise((resolve, reject) => {
    mkdirp(dir, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });

  return new Promise<any>((resolve, reject) => {
    request({
      url: urlStr + (!accessToken ? '' : `?private_token=${accessToken}`),
      timeout: 30000,
    })
        .on('error', (err) => {
          rmrf(dir);
          reject(err);
        })
        .on('response', (res) => {
          if (res.statusCode === 404) {
            reject(new Error('系统错误，请联系管理员'));
          } else if (res.statusCode !== 200) {
            reject(new Error('服务器配置错误'));
          }
        })
        .pipe(fs.createWriteStream(filePath))
        .on('close', () => {
          resolve({ path: filePath, dir, url: urlStr });
        });
  });
}

function getDirNameForArchiveUrl(archiveUrl: string): string {
  return archiveUrl
      .replace(/^https?:\/\//, '')
      .replace(/\/repository\/.+$/, '');
}

function unzipProcess(downloadRes: IDownloadRes): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const targetDir = path.dirname(downloadRes.path) + '/' + getDirNameForArchiveUrl(downloadRes.url);
    fs.createReadStream(downloadRes.path)
        .pipe(unzip.Parse())
        .on('entry', (entry) => {
          if (entry.type === 'File') {
            const filepath = `${targetDir}/${entry.path.split('/').slice(1).join('/')}`;
            const dir = path.dirname(filepath);
            mkdirp(dir, (err) => {
              if (err) {
                reject(err);
              } else {
                entry.pipe(fs.createWriteStream(filepath));
              }
            });
          }
        })
        .on('close', () => {
          resolve(targetDir);
        });
  });
}

export interface GitConfig {
  url: string;
  branch: string;
  accessToken?: string;
}

export interface LoadRes {
  parentDir: string;
  path: string;
}

export async function load(opt: GitConfig): Promise<LoadRes> {
  const { url, branch, accessToken } = opt;

  const promiseKey = `${url}-${branch}`;

  const promise = loadPromiseMap[promiseKey];
  if (promise) {
    return promise;
  }

  let parentDir: string = '';
  try {
    const archiveUrl = getArchiveUrl(url, branch);

    const branchLastCommitId = await getBranchLastCommitId(url, branch, accessToken);

    parentDir = `${CACHE_DIR}/${branchLastCommitId}`;

    if (!fs.existsSync(parentDir)) {
      let tempParentDir = `${CACHE_DIR}/temp-${v4()}`;

      const downloadRes = await download(
          archiveUrl,
          tempParentDir,
          accessToken,
      );

      await unzipProcess(downloadRes);

      if (!fs.existsSync(parentDir)) {
        await fs.rename(tempParentDir, parentDir);
      }
      rmrf(tempParentDir);

      delete loadPromiseMap[promiseKey];
      return { parentDir, path: parentDir + '/' + getDirNameForArchiveUrl(archiveUrl) };
    } else {

      delete loadPromiseMap[promiseKey];
      return { parentDir, path: parentDir + '/' + getDirNameForArchiveUrl(archiveUrl) };
    }
  } catch (e) {
    if (parentDir) {
      rmrf(parentDir);
    }
    delete loadPromiseMap[promiseKey];
    throw e;
  }
}
