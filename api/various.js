const _ = require('lodash')
const conf = require('../conf')
const db = require('./db')
const helpers = require('./helpers');


exports.get_url = (file_id) => `https://${conf.our_vhost}/get?id=${file_id}`
const get_file = exports.get_file = (file_id) => conf.upload_dir + '/' + file_id

exports.get_user_info = async (user) => {
    if (!user) throw "need relog"
    let info = {
        quota: conf.user_default.quota,
        max_daykeep: conf.user_default.max_daykeep,
        files_summary_by_deleted: _.merge({ 
            false: { total_size: 0, count: 0 },
            true: { total_size: 0, count: 0 },
        }, await db.files_summary_by_deleted(user)),
    }
    info.remaining_quota = info.quota - info.files_summary_by_deleted.false.total_size
    return info
}

const delete_file = async (doc) => {
    await helpers.fsP.unlink(get_file(doc._id))
    await db.set_deleted(doc)
}

exports.remove_expired = async function() {
    console.log("checking expired files to remove")
    for (const doc of (await db.files_to_delete())) {
        console.log("removing expired", doc)
        try {
            await delete_file(doc)
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.error("file already deleted? marking it deleted")
                await db.set_deleted(doc)
            } else {
                console.error("keeping file non deleted, hopefully the error will go away??", err)
            }
        }
    }
}
