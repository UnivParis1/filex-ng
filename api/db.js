const mongodb = require('mongodb');
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
