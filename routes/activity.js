const axios = require('axios');
const dayjs = require('dayjs');
const fastifyPlugin = require('fastify-plugin');

const CACHE_TTL_MS = 30 * 60 * 1000;

let cache = {
  timestamp: 0,
  data: {}
};

module.exports = fastifyPlugin(async function (fastify, opts) {
  const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
  const GITLAB_USERNAME = process.env.GITLAB_USERNAME;
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITLAB_TOKEN = process.env.GITLAB_TOKEN;

  async function fetchGitHubActivity() {
    console.log("Fetching GitHub activity...");
    const { request, gql } = await import('graphql-request');

    const endpoint = 'https://api.github.com/graphql';
    const query = gql`
    query {
      user(login: "${GITHUB_USERNAME}") {
        contributionsCollection {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

    const res = await request(endpoint, query, {}, {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
    });

    const calendar = res.user.contributionsCollection.contributionCalendar;
    const result = {};

    for (const week of calendar.weeks) {
      for (const day of week.contributionDays) {
        if (day.contributionCount > 0) {
          result[day.date] = day.contributionCount;
        }
      }
    }

    console.log("GitHub activity fetched");

    return result;
  }



  async function fetchGitLabActivity() {
    console.log("Fetching GitLab activity...");
    const now = dayjs();
    const oneYearAgo = now.subtract(1, 'year').format('YYYY-MM-DD');
    const baseUrl = 'https://gitlab.com/api/v4';

    try {
      // Получаем user_id
      const userRes = await axios.get(`${baseUrl}/users?username=${GITLAB_USERNAME}`, {
        headers: { 'Private-Token': GITLAB_TOKEN },
      });

      if (!userRes.data || userRes.data.length === 0) return {};

      const userId = userRes.data[0].id;
      const result = {};
      let page = 1;
      const perPage = 100;
      const maxRetries = 3;

      while (true) {
        const eventsUrl = `${baseUrl}/users/${userId}/events?after=${oneYearAgo}&per_page=${perPage}&page=${page}`;

        let attempt = 0;
        let success = false;
        let res;

        while (attempt < maxRetries && !success) {
          try {
            res = await axios.get(eventsUrl, {
              headers: { 'Private-Token': GITLAB_TOKEN },
            });

            if (res.status !== 200) {
              throw new Error(`Unexpected status code: ${res.status}`);
            }

            success = true;
          } catch (err) {
            attempt++;
            console.error(`Attempt ${attempt} failed for page ${page}:`, err.message);
            if (attempt >= maxRetries) {
              console.error("Max retries reached. Aborting GitLab activity fetch.");
              return result; // Возвращаем то, что успели собрать
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // увеличивающаяся задержка
          }
        }

        const events = res.data;

        for (const event of events) {
          const date = dayjs(event.created_at).format('YYYY-MM-DD');
          if (!result[date]) result[date] = 0;
          result[date]++;
        }

        const nextPage = res.headers['x-next-page'];
        if (!nextPage) break;

        page = parseInt(nextPage, 10);
      }

      console.log("GitLab activity fetched");
      return result;

    } catch (err) {
      console.error("Failed to fetch GitLab activity:", err.message);
      return {}; // Возвращаем пустой результат при полной ошибке
    }
  }



  async function getCombinedActivity() {
    const [github, gitlab] = await Promise.all([
      fetchGitHubActivity(),
      fetchGitLabActivity()
    ]);

    const combined = {};

    // Суммируем по дате
    for (const [date, count] of Object.entries(github)) {
      if (!combined[date]) combined[date] = 0;
      combined[date] += count;
    }

    for (const [date, count] of Object.entries(gitlab)) {
      if (!combined[date]) combined[date] = 0;
      combined[date] += count;
    }

    // Удаляем даты с 0 (временный, до нормализации)
    for (const date in combined) {
      if (combined[date] === 0) {
        delete combined[date];
      }
    }

    // Добавим обязательную стартовую дату — первое воскресенье
    const startSunday = getPreviousSunday();
    combined[startSunday] = combined[startSunday] || 0;

    // Сортируем по дате
    const sorted = Object.fromEntries(
        Object.entries(combined).sort(([a], [b]) => new Date(a) - new Date(b))
    );

    return sorted;
  }

  function getPreviousSunday() {
    const oneYearAgo = dayjs().subtract(365, 'day');
    const dayOfWeek = oneYearAgo.day(); // Sunday = 0
    return oneYearAgo.subtract(dayOfWeek, 'day').format('YYYY-MM-DD');
  }

  fastify.get('/git/activity', async function (request, reply) {
    const now = Date.now();
    if (now - cache.timestamp < CACHE_TTL_MS && Object.keys(cache.data).length) {
      return cache.data;
    }

    const data = await getCombinedActivity();

    // Сортировка и фильтрация
    const sorted = Object.fromEntries(
        Object.entries(data)
            .filter(([_, count]) => count > 0)
            .sort(([a], [b]) => new Date(a) - new Date(b))
    );

    cache = {
      timestamp: now,
      data: sorted,
    };

    return sorted;
  });

});
