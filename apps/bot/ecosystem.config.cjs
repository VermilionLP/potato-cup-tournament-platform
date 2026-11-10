// PM2 process for the QQ bots, separate from the website (suck-tournament):
//   cd /home/admin/suck/apps/bot && pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'potato-bot',
      cwd: __dirname,
      script: 'src/index.js',
      // A missing setting exits at once; stop retrying after a few tries
      // instead of restarting in a tight loop.
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 5000,
      // Card rendering (fonts, resvg) needs room above the ~120 MB baseline.
      max_memory_restart: '500M',
    },
  ],
};
