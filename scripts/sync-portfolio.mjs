import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const username = "March-77";
const token = process.env.GITHUB_TOKEN;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");

if (!token) {
  throw new Error("GITHUB_TOKEN is required to refresh public portfolio data.");
}

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "User-Agent": "March-77.github.io portfolio sync",
  "X-GitHub-Api-Version": "2022-11-28"
};

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub request failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  return response.json();
}

async function fetchMergedPullRequests() {
  const query = `
    query PortfolioPullRequests($query: String!, $cursor: String) {
      search(query: $query, type: ISSUE, first: 100, after: $cursor) {
        issueCount
        pageInfo { hasNextPage endCursor }
        nodes {
          ... on PullRequest {
            number
            title
            url
            createdAt
            mergedAt
            additions
            deletions
            changedFiles
            commits { totalCount }
            labels(first: 20) { nodes { name } }
            repository {
              nameWithOwner
              url
              description
              stargazerCount
              isPrivate
              owner { login }
              primaryLanguage { name color }
            }
          }
        }
      }
    }
  `;

  const nodes = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const payload = await request("https://api.github.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: {
          query: `is:pr author:${username} is:merged is:public`,
          cursor
        }
      })
    });

    if (payload.errors?.length) {
      throw new Error(`GitHub GraphQL error: ${JSON.stringify(payload.errors)}`);
    }

    const page = payload.data.search;
    nodes.push(...page.nodes.filter(Boolean));
    hasNextPage = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }

  if (nodes.some((pullRequest) => pullRequest.repository.isPrivate)) {
    throw new Error("Safety check failed: a non-public pull request reached the public dataset.");
  }

  return nodes;
}

async function fetchPublicRepositories() {
  const repositories = [];
  let page = 1;

  while (true) {
    const batch = await request(
      `https://api.github.com/users/${username}/repos?type=owner&sort=updated&per_page=100&page=${page}`
    );
    repositories.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }

  return repositories;
}

function contributionType(title) {
  const match = title.match(/^([a-z]+)(?:\([^)]*\))?[!:]/i);
  const type = match?.[1]?.toLowerCase();
  const known = new Set(["fix", "feat", "docs", "perf", "test", "refactor", "chore", "ci"]);
  return known.has(type) ? type : "other";
}

const featuredStories = {
  "bytedance/deer-flow#4443": {
    rank: 1,
    title: "让 Sandbox 生命周期安全收敛",
    summary: "处理跨实例所有权、重复 Sandbox、崩溃恢复与安全回收，让资源在并发和异常场景下保持一致。"
  },
  "Tencent/WeKnora#2202": {
    rank: 2,
    title: "删除知识库后不再遗留队列任务",
    summary: "补齐软删除后的任务取消、状态转换与恢复流程，避免已删除知识库继续消耗后台资源。"
  },
  "bytedance/deer-flow#4392": {
    rank: 3,
    title: "为 Telegram 接入图片与文档",
    summary: "打通入站附件处理，同时覆盖大小限制、敏感元数据清理与关闭时取消等边界情况。"
  },
  "spring-ai-alibaba/DataAgent#575": {
    rank: 4,
    title: "保留多步骤 SQL 结果的上下文",
    summary: "将多步骤查询结果按顺序、分组地传递给 Python 节点，避免后续分析只看到最后一次查询。"
  },
  "strands-agents/harness-sdk#3435": {
    rank: 5,
    title: "并发获取 MCP 搜索摘要",
    summary: "把串行摘要加载改为受控并发，降低搜索结果水合延迟，同时保留稳定的结果顺序。"
  },
  "agentscope-ai/agentscope#2120": {
    rank: 6,
    title: "兼容只返回思考内容的模型响应",
    summary: "修复 extended-thinking 模型产生空白回复时提前停止的问题，让 Agent 能继续完成 ReAct 循环。"
  }
};

const [allPullRequests, allRepositories, curationRaw] = await Promise.all([
  fetchMergedPullRequests(),
  fetchPublicRepositories(),
  readFile(path.join(rootDir, "data", "project-curation.json"), "utf8")
]);

const curation = JSON.parse(curationRaw);
const publicMerged = allPullRequests.filter((pullRequest) => pullRequest.mergedAt);
const external = publicMerged
  .filter((pullRequest) => pullRequest.repository.owner.login.toLowerCase() !== username.toLowerCase())
  .map((pullRequest) => {
    const key = `${pullRequest.repository.nameWithOwner}#${pullRequest.number}`;
    const story = featuredStories[key] || null;
    return {
      key,
      repository: pullRequest.repository.nameWithOwner,
      repositoryUrl: pullRequest.repository.url,
      repositoryDescription: pullRequest.repository.description || "",
      repositoryStars: pullRequest.repository.stargazerCount,
      language: pullRequest.repository.primaryLanguage?.name || "Other",
      languageColor: pullRequest.repository.primaryLanguage?.color || "#718096",
      number: pullRequest.number,
      title: pullRequest.title,
      url: pullRequest.url,
      createdAt: pullRequest.createdAt,
      mergedAt: pullRequest.mergedAt,
      additions: pullRequest.additions,
      deletions: pullRequest.deletions,
      changedFiles: pullRequest.changedFiles,
      commitCount: pullRequest.commits.totalCount,
      labels: pullRequest.labels.nodes.map((label) => label.name),
      type: contributionType(pullRequest.title),
      featured: Boolean(story),
      story
    };
  })
  .sort((a, b) => new Date(b.mergedAt) - new Date(a.mergedAt));

const repositories = Object.values(
  external.reduce((groups, pullRequest) => {
    const current = groups[pullRequest.repository] || {
      nameWithOwner: pullRequest.repository,
      url: pullRequest.repositoryUrl,
      description: pullRequest.repositoryDescription,
      stars: pullRequest.repositoryStars,
      language: pullRequest.language,
      languageColor: pullRequest.languageColor,
      pullRequestCount: 0,
      latestMergedAt: pullRequest.mergedAt,
      types: {}
    };

    current.pullRequestCount += 1;
    current.types[pullRequest.type] = (current.types[pullRequest.type] || 0) + 1;
    if (new Date(pullRequest.mergedAt) > new Date(current.latestMergedAt)) {
      current.latestMergedAt = pullRequest.mergedAt;
    }
    groups[pullRequest.repository] = current;
    return groups;
  }, {})
).sort((a, b) => b.pullRequestCount - a.pullRequestCount || a.nameWithOwner.localeCompare(b.nameWithOwner));

const repoByName = new Map(allRepositories.map((repository) => [repository.name, repository]));
const projects = Object.entries(curation)
  .map(([name, manual]) => {
    const repository = repoByName.get(name);
    if (!repository || repository.private || repository.fork) {
      throw new Error(`Curated project is missing or not a public source repository: ${name}`);
    }

    return {
      name,
      url: repository.html_url,
      homepage: repository.homepage || "",
      description: repository.description || "",
      summary: manual.summary,
      tech: manual.tech || [],
      category: manual.category,
      status: manual.status,
      featured: manual.featured,
      order: manual.order,
      language: repository.language || "Other",
      stars: repository.stargazers_count,
      forks: repository.forks_count,
      license: repository.license?.spdx_id || null,
      topics: repository.topics || [],
      updatedAt: repository.updated_at,
      pushedAt: repository.pushed_at,
      archived: repository.archived
    };
  })
  .sort((a, b) => a.order - b.order);

const sum = (field) => external.reduce((total, item) => total + item[field], 0);
const output = {
  generatedAt: new Date().toISOString(),
  source: {
    username,
    query: `is:pr author:${username} is:merged is:public`,
    note: "Only public, merged pull requests are included. Private activity is never exported."
  },
  summary: {
    publicMergedPullRequests: publicMerged.length,
    externalMergedPullRequests: external.length,
    ownMergedPullRequests: publicMerged.length - external.length,
    upstreamRepositories: repositories.length,
    commits: sum("commitCount"),
    changedFiles: sum("changedFiles"),
    additions: sum("additions"),
    deletions: sum("deletions"),
    projects: projects.length
  },
  repositories,
  contributions: external,
  projects
};

const outputPath = path.join(rootDir, "data", "portfolio.json");
let previous = null;
try {
  previous = JSON.parse(await readFile(outputPath, "utf8"));
} catch {
  previous = null;
}

const comparable = (value) => {
  const { generatedAt, ...rest } = value;
  return JSON.stringify(rest);
};

if (previous && comparable(previous) === comparable(output)) {
  console.log(
    `Public portfolio data is unchanged: ${external.length} external merged PRs, ` +
    `${repositories.length} upstream repositories, ${projects.length} projects.`
  );
} else {
  await mkdir(path.join(rootDir, "data"), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(
    `Updated public portfolio data: ${external.length} external merged PRs, ` +
    `${repositories.length} upstream repositories, ${projects.length} projects.`
  );
}
