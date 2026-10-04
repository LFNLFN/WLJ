module.exports = {
  apps: [{
    name: 'wlj',
    script: 'npm',
    args: 'start',
    cwd: '/opt/wlj',
    env: {
      NODE_ENV: 'production',
    },
    env_file: '.env',
    max_restarts: 10,
    restart_delay: 3000,
    autorestart: true,
  }],
};
