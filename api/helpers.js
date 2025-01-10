// only external requires, so that it can be used in conf.js
const fs = require('fs')
const dns = require('dns')
const util = require('util')
const formidable = require('formidable')
const spawn = require('child_process').spawn;

exports.fsP = {
    copyFile: util.promisify(fs.copyFile),
    stat: util.promisify(fs.stat),
    unlink: util.promisify(fs.unlink),
    readFile: util.promisify(fs.readFile),
}
exports.dns_reverse = util.promisify(dns.reverse)

exports.minutes_to_ms = (minutes) => minutes * 60 * 1000

exports.now = () => new Date()

exports.addDays = function (date, days) {
    var r = new Date(date);
    r.setTime(r.getTime() + days * 60 * 60 * 24 * 1000);
    return r;
}

exports.throw_ = (err) => { throw err }

exports.format_date = (date) => (
    date.toLocaleString('fr-FR', { hour12: false })
)

exports.un_formatBytes = (formatted) => {
    const suffixes = { K: 1024, M: 1024 ** 2, G: 1024 ** 3 }
    const m = ("" + formatted).match(/^([\d.]+)\s*([KMG])i?[BO]?$/i)
    if (!m) throw "invalid formatted bytes " + formatted
    return parseFloat(m[1]) * suffixes[m[2].toUpperCase()]
}

// from stackoverflow. complex but it works
exports.formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Octet';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Octets', 'Ko', 'Mo', 'Go', 'To', 'Po', 'Eo', 'Zo', 'Yo'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// similar to lodash.keyBy, but also remove the key from each object
// optional "valueKey" parameter
exports.keyBy = (l, key, valueKey) => {
    let r = {}
    for (const o of l) {
        const k = o[key]
        if (valueKey) {
            r[k] = o[valueKey]
        } else {
            delete o[key]
            r[k] = o;
        }
    }
    return r
}

exports.renameKey = (o, oldK, newK) => {
    if (o && oldK in o) {
        const { [oldK]: value, ...o_ } = o;
        return { ...o_, [newK]: value }
    } else {
        return { ...o }
    }
}

exports.promise_WriteStream_pipe = (req, writeStream) => (
    new Promise((resolve, reject) => {
        let ok = false
        req.on('end', () => ok = true)
        writeStream.on('close', async () => {
            console.log('writeStream close event')
            if (ok) resolve()
        })
        req.on('aborted', () => { console.error("aborted"); reject('aborted') }) // more handled by 'close' event
        req.on('error', () => { console.error("error"); reject('error') }) // more handled by 'close' event
        req.on('close', async () => {
            writeStream.close(); // need to be done to avoid leaks
            if (!ok) {
                console.log("error occurred, req close")
                reject() // in case not already done
            }
        })
        req.pipe(writeStream)   
    })
)

// do not call pipe before readStream is "ready" (to allow handling initial readStream errors)
exports.promise_ReadStream_pipe = (readStream, prepare_response) => (
    new Promise((resolve, reject) => {
        readStream.on('error', reject)
        readStream.on('end', resolve)
        readStream.on('ready', function () {
            const response = prepare_response()
            const close_input = err => { readStream.close(); reject(err || "client abort or timeout or ???") }
            response.on('close', close_input) // should be enough
            response.on('error', close_input) // adding more just in case /o\
            response.on('finish', close_input) // adding more just in case /o\
            readStream.pipe(response)
        })
    })
)

exports.form_parse = (req, options, file_names) => (
    new Promise((resolve, reject) => {
        const form = formidable(options)
        form.onPart = function (part) {
            if (!file_names.includes(part.name)) {
                // we want it to be a "field" (cf https://github.com/node-formidable/formidable/issues/875 )
                // even if it has a mimetype
                delete part.mimetype
            }
            form._handlePart(part);
        }
        form.parse(req, (err, fields, files) => {
            if (err) {
                reject(err);
            } else {
                resolve({ fields, files })
            }
        })
    })
)

// (inText: string, cmd: string, params: string[]): Promise<string>
exports.popen = (inText, cmd, params) => {
    let p = spawn(cmd, params);
    p.stdin.write(inText);
    p.stdin.end();

    return new Promise((resolve, reject) => {
        let output = '';
        let get_ouput = data => { output += data; };
        
        p.stdout.on('data', get_ouput);
        p.stderr.on('data', get_ouput);
        p.on('error', event => {
            reject(event);
        });
        p.on('close', code => {
            if (code === 0) resolve(output); else reject(output);
        });
    });
}
