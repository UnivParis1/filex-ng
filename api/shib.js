const http = require('http')
const conf = require('../conf')

const simplify_shib_attrs = (attrs) => {
    let r = {}
    for (const e of attrs) {
        if (conf.wanted_mono_shib_attrs.includes(e.name)) {
            r[e.name] = e.values[0]
        }
    }
    return r
}

const get_attrs = (Cookie) => (new Promise((resolve, reject) => {
    http.get({
        host: conf.apache_shib_host,
        path: '/Shibboleth.sso/Session',
        headers: { Cookie, Host: conf.our_vhost }
    }).once('response', function (resp) {
        if (resp.statusCode != 200) {
            reject(resp)
            return
        }
        let data = ""
        resp.on('data', chunk => data += chunk)
        resp.on('end', () => {
            const shib_session = JSON.parse(data)
            if (shib_session && shib_session.attributes) {
                resolve(simplify_shib_attrs(shib_session.attributes))
            } else {
                reject()
            }
        })
        resp.on('error', (e) => reject(e))
    })
}))

exports.may_create_session = async (req, res, next) => {
    if (!req.session.user) {
        try {
            req.session.user = await get_attrs(req.headers.cookie)
            //console.log("created session", req.session.user)
        } catch (err) {
            console.log("shib.get_attrs failed:", err)
        }
    } else {
        //console.log("existing session", req.session.user)
    }
    next()
}

exports.ensure_connected = async (req, res, next) => {
    if (!req.session.user) {
        //console.log("no shib session, redirecting", req.originalUrl)
        res.redirect('/Shibboleth.sso/Login?target=' + encodeURIComponent(req.originalUrl))
        return
    }
    next()
}