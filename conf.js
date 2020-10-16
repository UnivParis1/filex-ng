const sendmailTransport = require('nodemailer-sendmail-transport');
const helpers = require('./api/helpers')

let conf = {
    port: 6001,

    our_vhost: 'filex-ng.univ.fr',
    apache_shib_host: 'localhost',

    user_default: {
        quota: helpers.un_formatBytes('6G'),
        max_daykeep: 45,
    },

    mongodb: { 
        url: "mongodb://localhost/filex-ng",
    },

    upload_dir: '/webhome/filex-ng/uploads',
    
    wanted_mono_shib_attrs: [ "mail", "eppn" ],

    session: {
        'secret': 'XXXfilex-ngXXX',
        'FileStore': { path: '/tmp', retries: 0 },
    },
    
    mail: {
        from: 'Université Paris 1 (ne pas répondre) <noreply@univ.fr>',
        intercept: '', //'pascal.rigaux@univ.fr',
        transport: sendmailTransport({ path: '/usr/sbin/sendmail' }), // give sendmail with full path (since PATH may not have /usr/sbin/)
    },

    request_to_ip: req => req.headers['x-forwarded-for'] || req.connection.remoteAddress,

    trusted: {
        bearer_tokens: [],
        IPs: [],
    },

    //antivirus: 'clamdscan',
};

module.exports = conf;
