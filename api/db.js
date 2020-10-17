const mongodb = require('mongodb');
const helpers = require('./helpers');
const conf = require('../conf');

let client_cache;

const get_client_raw = () => {
    return mongodb.MongoClient.connect(conf.mongodb.url, { useUnifiedTopology: true }).then(client => {
        client_cache = client.db();
        return client_cache;
    })
};    
const get_client = () => (
    client_cache
        ? Promise.resolve(client_cache)
        : get_client_raw()
);


const _id = (id) => new mongodb.ObjectID(id)

exports.new_id = () => _id(null)

const collection = async (collection_name) => (
    (await get_client()).collection(collection_name)
)

exports.get_upload = async (id) => (
    (await collection('uploads')).find({ _id: _id(id) }).limit(1).next()
);

exports.get_exemption = async (userid) => (
    (await collection('exemptions')).find({ _id: userid }).limit(1).next()
);

exports.get_exemptions = async () => (
    (await (await collection('exemptions')).find().sort({ modifyTimestamp: 1 }).toArray()).map(e => helpers.renameKey(e, '_id', 'userid'))
);

exports.insert_upload = async (doc) => (
    (await collection('uploads')).insertOne(doc)
)

exports.insert_download = async (log) => (
    (await collection('downloads')).insertOne(log)
)

exports.set_upload = async (doc, subdoc) => (
    (await collection('uploads')).updateOne({ _id: doc._id }, { $set: subdoc })
)

exports.set_exemption = async (userid, doc) => (
    (await collection('exemptions')).replaceOne({ _id: userid }, doc, { upsert: true })
)

exports.set_exemption = async (userid, doc) => (
    (await collection('exemptions')).replaceOne({ _id: userid }, doc, { upsert: true })
)

exports.delete_exemption = async (userid) => (
    (await collection('exemptions')).deleteOne({ _id: userid })
)

exports.files_to_delete = async () => (
    (await collection('uploads')).find({ expireAt: { $lte: helpers.now() }, deleted: false }).toArray()
)

// return count & total_size for deleted & non-deleted files
exports.files_summary_by_deleted = async (user) => (
    helpers.keyBy(await (await collection('uploads')).aggregate([ 
        { $match: { "uploader.eppn": user.eppn } }, 
        { $group: { "_id": "$deleted", count: {$sum: 1}, total_size: {$sum: '$size' } } },
    ]).toArray(), '_id')
)

const filter_deleted = (filter, include_deleted) => (
    include_deleted ? filter: { ...filter, deleted: false }
)

exports.user_files = async (user, include_deleted) => (
    (await collection('uploads')).find(
        filter_deleted({ "uploader.eppn": user.eppn }, include_deleted),
        { projection: { uploader: 0, password: 0 } },
    ).sort({ "uploadTimestamp": -1 }).toArray()
)

exports.user_file = async (user, id) => (
    (await collection('uploads')).find(
        { "uploader.eppn": user.eppn, _id: _id(id) },
    ).limit(1).next()
)

exports.files_download_count = async (ids) => (
    helpers.keyBy(await (await collection('downloads')).aggregate([ 
        { $match: { doc: { $in: ids.map(_id) } } },
        { $group: { "_id": "$doc", count: {$sum: 1}  } },
    ]).toArray(), '_id', 'count')
)

exports.file_downloads = async (id) => (
    (await collection('downloads')).find(
        { doc: _id(id) },
        { projection: { ip: 1, timestamp: 1, bytes: 1, _id: 0 }},
    ).toArray()
)
