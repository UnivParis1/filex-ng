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

exports.insert_upload = async (doc) => (
    (await collection('uploads')).insertOne(doc)
)

exports.insert_download = async (log) => (
    (await collection('downloads')).insertOne(log)
)

exports.set_deleted = async (doc) => (
    (await collection('uploads')).updateOne({ _id: doc._id }, { $set: { deleted: true } })
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
        { fields: { uploader: 0 } },
    ).toArray()
)

exports.user_file = async (user, id) => (
    (await collection('uploads')).find(
        { "uploader.eppn": user.eppn, _id: _id(id) },
        { fields: { uploader: 0 } },
    ).limit(1).next()
)

exports.files_download_count = async (ids) => (
    helpers.keyBy(await (await collection('downloads')).aggregate([ 
        { $match: { doc: { $in: ids.map(_id) } } },
        { $group: { "_id": "$doc", count: {$sum: 1}  } },
    ]).toArray(), '_id', 'count')
)

exports.file_download = async (id) => (
    (await collection('downloads')).find(
        { doc: _id(id) },
        { projection: { doc: 0 }},
    ).toArray()
)

// TODO ajout index "uploader.eppn" sur "db.uploads"

// nb de téléchargement
//db.downloads.aggregate([ { $match: { doc: { $in: [ ObjectId("5ebb1a76aa8d98a84dc9f936"), ObjectId("5ebb1a76aa8d98a84dc9f935") ] } } }, { $group: { "_id": "$doc", count: {$sum: 1}  } } ])
//db.downloads.count({ doc: ObjectId("5ebb1a76aa8d98a84dc9f935") })
