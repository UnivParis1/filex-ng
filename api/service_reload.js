const fs = require('fs')
const spawn = require('child_process').spawn;

const PIDFile = () => process.env["PIDFile"]

const server_closeP = (server) => new Promise(resolve => server.close(resolve))
const fs_watchP = (file) => new Promise(resolve => fs.watch(file, resolve))

function spawn_ourself_detached() {
    const p = spawn(process.argv.shift(), process.argv, {
        cwd: process.cwd(),
        detached : true, stdio: "inherit", stdout: "inherit", stderr: "inherit",
    })
    p.unref()
}

async function close_spawn_and_graceful_exit(server, PIDFile) {
    console.info('SIGHUP signal received. Closing http server and starting new one');

    const closing_server = server_closeP(server)

    spawn_ourself_detached()
    await fs_watchP(PIDFile)
    console.log('Child is ready');

    await closing_server // NB: it won't work nicely if there are HTTP KeepAlive connections. We expect the reverse proxy NOT to use HTTP KeepAlive
    console.log("No more connections. Exiting", process.pid)
    process.exit(0)
}

module.exports = {
    may_write_PIDFile() {
        if (PIDFile()) {
            console.log("Successfully started", process.pid)
            fs.writeFile(PIDFile(), "" + process.pid + "\n", (err) => { if (err) console.error(err) })
        }
    },
    may_handle_reload(server) {
        if (PIDFile()) {
            process.on('SIGHUP', _ => close_spawn_and_graceful_exit(server, PIDFile()))
        }
    },
}
