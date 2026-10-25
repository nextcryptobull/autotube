// PM2 ecosystem config for AutoTube Studio
// Run with: pm2 start deploy/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "autotube",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: "/opt/autotube",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "2G",
      error_file: "/var/log/autotube/error.log",
      out_file: "/var/log/autotube/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      kill_timeout: 5000,
    },
  ],
};
