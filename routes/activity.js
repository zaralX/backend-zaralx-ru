const axios = require('axios');
const dayjs = require('dayjs');
const fastifyPlugin = require('fastify-plugin');

const CACHE_TTL_MS = 30 * 60 * 1000;

let cache = {
  timestamp: 0,
  data: {},
};

module.exports = fastifyPlugin(async function (fastify, opts) {
  const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
  const GITLAB_USERNAME = process.env.GITLAB_USERNAME;
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITLAB_TOKEN = process.env.GITLAB_TOKEN;

  async function fetchGitHubActivity() {
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

    return result;
  }



  async function fetchGitLabActivity() {
    const now = dayjs();
    const oneYearAgo = now.subtract(1, 'year').format('YYYY-MM-DD');
    const baseUrl = 'https://gitlab.com/api/v4';

    // 1. Получаем user_id по username
    const userRes = await axios.get(`${baseUrl}/users?username=${GITLAB_USERNAME}`, {
      headers: { 'Private-Token': GITLAB_TOKEN },
    });

    if (!userRes.data || userRes.data.length === 0) return {};

    const userId = userRes.data[0].id;

    const result = {};
    let page = 1;
    const perPage = 100;

    while (true) {
      const eventsUrl = `${baseUrl}/users/${userId}/events?after=${oneYearAgo}&per_page=${perPage}&page=${page}`;
      const res = await axios.get(eventsUrl, {
        headers: { 'Private-Token': GITLAB_TOKEN },
      });

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

    return result;
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
