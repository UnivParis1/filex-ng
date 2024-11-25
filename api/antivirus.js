const conf = require('../conf')
const helpers = require('./helpers')


const clamdscan = async (file) => {
    try {
        await helpers.popen('', 'clamdscan', ['--fdpass', '--no-summary', file])
    } catch (err) {
        return (err.match(/: (.*)/) || [])[1]
    }
}

const known_antivirus = { clamdscan }

exports.may_check = async (file) => {
    let detector = conf.antivirus ? known_antivirus[conf.antivirus] : (async _ => '')
    if (!detector) throw "bad conf: unkown conf.antivirus"
    const detected_virus = await detector(file)
    if (detected_virus) {
        await helpers.fsP.unlink(file)
        throw "detected virus: " + detected_virus
    }
}
