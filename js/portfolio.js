(function() {
  "use strict";

  const root = document.querySelector("[data-portfolio-page]");
  if (!root) return;

  const page = root.getAttribute("data-portfolio-page");
  const dataUrl = root.getAttribute("data-portfolio-data") || "/data/portfolio.json";
  const numberFormatter = new Intl.NumberFormat("zh-CN");
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const typeLabels = {
    fix: "修复",
    feat: "功能",
    docs: "文档",
    perf: "性能",
    test: "测试",
    refactor: "重构",
    chore: "维护",
    ci: "CI",
    other: "其他"
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value) {
    return dateFormatter.format(new Date(value));
  }

  function formatNumber(value) {
    return numberFormatter.format(Number(value || 0));
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }

  function setGeneratedAt(data) {
    setText("[data-generated-at]", `${formatDate(data.generatedAt)} · GitHub 公开数据`);
  }

  function linkIcon() {
    return '<i class="iconfont icon-github-fill" aria-hidden="true"></i>';
  }

  function renderError(error) {
    const targets = root.querySelectorAll("[data-render-target]");
    targets.forEach((target) => {
      target.innerHTML =
        '<div class="portfolio-error">公开数据暂时无法加载，请稍后刷新或前往 GitHub 查看。</div>';
    });
    console.error("Portfolio data failed to load:", error);
  }

  function renderContributionStats(data) {
    setText("[data-stat='external-prs']", formatNumber(data.summary.externalMergedPullRequests));
    setText("[data-stat='upstream-repos']", formatNumber(data.summary.upstreamRepositories));
    setText("[data-stat='commits']", formatNumber(data.summary.commits));
    setText("[data-stat='changed-files']", formatNumber(data.summary.changedFiles));
    setText("[data-stat='diff']", `+${formatNumber(data.summary.additions)} / -${formatNumber(data.summary.deletions)}`);
  }

  function renderFeaturedContributions(data) {
    const target = document.querySelector("[data-featured-contributions]");
    if (!target) return;
    const featured = data.contributions
      .filter((item) => item.featured && item.story)
      .sort((a, b) => a.story.rank - b.story.rank);

    target.innerHTML = featured.map((item, index) => `
      <article class="portfolio-story">
        <span class="portfolio-story-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
        <div class="portfolio-story-repo">${escapeHtml(item.repository)} · #${item.number}</div>
        <h3>${escapeHtml(item.story.title)}</h3>
        <p>${escapeHtml(item.story.summary)}</p>
        <div class="portfolio-story-footer">
          <span>${formatDate(item.mergedAt)} 合并</span>
          <a class="portfolio-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
            ${linkIcon()} 查看 PR
          </a>
        </div>
      </article>
    `).join("");
  }

  function renderRepositoryGroups(data) {
    const target = document.querySelector("[data-repository-groups]");
    if (!target) return;
    const max = Math.max(...data.repositories.map((repository) => repository.pullRequestCount), 1);

    target.innerHTML = data.repositories.map((repository) => `
      <article class="portfolio-repo-card" style="--repo-share:${Math.round(repository.pullRequestCount / max * 100)}%">
        <div class="portfolio-repo-head">
          <a class="portfolio-repo-name" href="${escapeHtml(repository.url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(repository.nameWithOwner)}
          </a>
          <span class="portfolio-repo-count">${repository.pullRequestCount} merged</span>
        </div>
        <p class="portfolio-repo-description">${escapeHtml(repository.description || "Public open-source repository")}</p>
        <div class="portfolio-repo-meta">
          <span class="portfolio-language">
            <span class="portfolio-language-dot" style="--language-color:${escapeHtml(repository.languageColor)}"></span>
            ${escapeHtml(repository.language)}
          </span>
          <span>★ ${formatNumber(repository.stars)}</span>
          <span>最近 ${formatDate(repository.latestMergedAt)}</span>
        </div>
        <div class="portfolio-repo-bar" aria-hidden="true"><span></span></div>
      </article>
    `).join("");
  }

  function populateSelect(select, values, label) {
    if (!select || select.options.length > 1) return;
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label ? label(value) : value;
      select.appendChild(option);
    });
  }

  function contributionMarkup(item) {
    return `
      <article class="portfolio-contribution" role="listitem">
        <span class="portfolio-type" data-type="${escapeHtml(item.type)}">${escapeHtml(typeLabels[item.type] || "其他")}</span>
        <div class="portfolio-contribution-main">
          <span class="portfolio-contribution-repo">${escapeHtml(item.repository)}</span>
          <a class="portfolio-contribution-title" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(item.title)}
          </a>
          <span class="portfolio-contribution-number"> #${item.number}</span>
        </div>
        <div class="portfolio-contribution-meta">
          <span>${formatDate(item.mergedAt)}</span>
          <span><span class="portfolio-diff-add">+${formatNumber(item.additions)}</span> / <span class="portfolio-diff-del">-${formatNumber(item.deletions)}</span></span>
          <span>${item.changedFiles} files · ${item.commitCount} commits</span>
        </div>
      </article>
    `;
  }

  function initContributionExplorer(data) {
    const list = document.querySelector("[data-contribution-list]");
    const count = document.querySelector("[data-contribution-count]");
    const search = document.querySelector("#contribution-search");
    const repository = document.querySelector("#contribution-repository");
    const type = document.querySelector("#contribution-type");
    const sort = document.querySelector("#contribution-sort");
    if (!list || !count) return;

    populateSelect(repository, data.repositories.map((item) => item.nameWithOwner));
    populateSelect(
      type,
      [...new Set(data.contributions.map((item) => item.type))].sort(),
      (value) => typeLabels[value] || value
    );

    const params = new URLSearchParams(window.location.search);
    if (search) search.value = params.get("q") || "";
    if (repository && [...repository.options].some((option) => option.value === params.get("repo"))) {
      repository.value = params.get("repo");
    }
    if (type && [...type.options].some((option) => option.value === params.get("type"))) {
      type.value = params.get("type");
    }

    function render() {
      const term = (search?.value || "").trim().toLowerCase();
      const selectedRepo = repository?.value || "";
      const selectedType = type?.value || "";
      const selectedSort = sort?.value || "newest";

      const filtered = data.contributions
        .filter((item) => {
          const haystack = `${item.repository} ${item.title} ${item.labels.join(" ")}`.toLowerCase();
          return (!term || haystack.includes(term)) &&
            (!selectedRepo || item.repository === selectedRepo) &&
            (!selectedType || item.type === selectedType);
        })
        .sort((a, b) => {
          if (selectedSort === "oldest") return new Date(a.mergedAt) - new Date(b.mergedAt);
          if (selectedSort === "repository") {
            return a.repository.localeCompare(b.repository) || new Date(b.mergedAt) - new Date(a.mergedAt);
          }
          return new Date(b.mergedAt) - new Date(a.mergedAt);
        });

      count.textContent = `显示 ${filtered.length} / ${data.contributions.length} 个公开外部 merged PR`;
      list.innerHTML = filtered.length
        ? filtered.map(contributionMarkup).join("")
        : '<div class="portfolio-empty">没有符合当前筛选条件的贡献。</div>';

      const nextParams = new URLSearchParams();
      if (term) nextParams.set("q", search.value.trim());
      if (selectedRepo) nextParams.set("repo", selectedRepo);
      if (selectedType) nextParams.set("type", selectedType);
      const query = nextParams.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }

    [search, repository, type, sort].filter(Boolean).forEach((control) => {
      control.addEventListener(control.tagName === "INPUT" ? "input" : "change", render);
    });
    render();
  }

  function renderProjectStats(data) {
    const languages = new Set(data.projects.map((project) => project.language).filter(Boolean));
    const licensed = data.projects.filter((project) => project.license).length;
    setText("[data-stat='projects']", formatNumber(data.summary.projects));
    setText("[data-stat='project-languages']", formatNumber(languages.size));
    setText("[data-stat='licensed-projects']", formatNumber(licensed));
    setText("[data-stat='featured-projects']", formatNumber(data.projects.filter((project) => project.featured).length));
  }

  function projectMarkup(project, featured = false) {
    const license = project.license || "未声明许可证";
    const techTags = (project.tech || []).slice(0, featured ? 6 : 4)
      .map((tech) => `<span class="portfolio-project-tag">${escapeHtml(tech)}</span>`)
      .join("");
    const homepage = project.homepage
      ? `<a class="portfolio-link" href="${escapeHtml(project.homepage)}" target="_blank" rel="noopener noreferrer">在线地址</a>`
      : "";
    return `
      <article class="portfolio-project-card${featured ? " is-featured" : ""}">
        <div class="portfolio-project-kicker">${escapeHtml(project.category)} · ${escapeHtml(project.status)}</div>
        <h3>${escapeHtml(project.name)}</h3>
        <p>${escapeHtml(project.summary)}</p>
        <div class="portfolio-project-tags">
          ${techTags}
          <span class="portfolio-license${project.license ? "" : " is-missing"}">${escapeHtml(license)}</span>
        </div>
        <div class="portfolio-project-meta">
          <span class="portfolio-language">
            <span class="portfolio-language-dot" style="--language-color:${escapeHtml(languageColor(project.language))}"></span>
            ${escapeHtml(project.language)}
          </span>
          <span>★ ${formatNumber(project.stars)}</span>
          <span>更新于 ${formatDate(project.updatedAt)}</span>
        </div>
        <div class="portfolio-project-footer">
          ${homepage}
          <a class="portfolio-link" href="${escapeHtml(project.url)}" target="_blank" rel="noopener noreferrer">
            ${linkIcon()} GitHub
          </a>
        </div>
      </article>
    `;
  }

  function languageColor(language) {
    const colors = {
      Python: "#3572A5",
      Java: "#b07219",
      TypeScript: "#3178c6",
      JavaScript: "#f1e05a",
      "C++": "#f34b7d",
      Go: "#00ADD8",
      HTML: "#e34c26"
    };
    return colors[language] || "#718096";
  }

  function renderFeaturedProjects(data) {
    const target = document.querySelector("[data-featured-projects]");
    if (!target) return;
    target.innerHTML = data.projects
      .filter((project) => project.featured)
      .map((project) => projectMarkup(project, true))
      .join("");
  }

  function initProjectExplorer(data) {
    const list = document.querySelector("[data-project-list]");
    const count = document.querySelector("[data-project-count]");
    const search = document.querySelector("#project-search");
    const category = document.querySelector("#project-category");
    const status = document.querySelector("#project-status");
    if (!list || !count) return;

    populateSelect(category, [...new Set(data.projects.map((project) => project.category))].sort());
    populateSelect(status, [...new Set(data.projects.map((project) => project.status))].sort());

    function render() {
      const term = (search?.value || "").trim().toLowerCase();
      const selectedCategory = category?.value || "";
      const selectedStatus = status?.value || "";
      const filtered = data.projects.filter((project) => {
        const haystack = `${project.name} ${project.summary} ${project.description} ${project.language}`.toLowerCase();
        return (!term || haystack.includes(term)) &&
          (!selectedCategory || project.category === selectedCategory) &&
          (!selectedStatus || project.status === selectedStatus);
      });

      count.textContent = `显示 ${filtered.length} / ${data.projects.length} 个个人作品`;
      list.innerHTML = filtered.length
        ? filtered.map((project) => projectMarkup(project)).join("")
        : '<div class="portfolio-empty">没有符合当前筛选条件的项目。</div>';
    }

    [search, category, status].filter(Boolean).forEach((control) => {
      control.addEventListener(control.tagName === "INPUT" ? "input" : "change", render);
    });
    render();
  }

  fetch(dataUrl, { headers: { Accept: "application/json" } })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      setGeneratedAt(data);
      if (page === "contributions") {
        renderContributionStats(data);
        renderFeaturedContributions(data);
        renderRepositoryGroups(data);
        initContributionExplorer(data);
      }
      if (page === "projects") {
        renderProjectStats(data);
        renderFeaturedProjects(data);
        initProjectExplorer(data);
      }
    })
    .catch(renderError);
})();
