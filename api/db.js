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


const v_export_id = (v) => {
    if (v) {
        if (!("id" in v)) v.id = v._id;
        delete v._id;
    }
    return v;
}

const _id = (id) => new mongodb.ObjectID(id)

exports.new_id = () => _id(null)

exports.collection = async (collection_name) => (
    (await get_client()).collection(collection_name)
)

exports.get = (collection, id) => (
    collection.find({ _id: _id(id) }).limit(1).next().then(v_export_id)
);
