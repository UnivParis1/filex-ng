Vue.createApp({
    components: { File_options },
    created() {
        this.get_file(document.location.hash.replace(/^#/, ''))
    },
    data: () => ({
            file: undefined,
            info: undefined,
            modified_options: [],
    }),
    methods: {
        get_file(id) {
            var that = this;
            call_xhr('GET', '/user/file/' + id, null).then(function (file) {
                file.with_password = !!file.password
                that.file = file;
                that.file_orig = { ...file }
            }).catch(function (_resp) {
                document.location.href = "/manage";
            })    
            call_xhr('GET', '/user/info', null).then(function (info) {
                that.info = info;
            })
        },
        delete_file() {
            call_xhr('DELETE', '/user/file/' + this.file._id, null).then(function () {
                alert("Fichier supprimé");
                document.location.href = "/manage";
            });
        },
        extend_lifetime() {
            var that = this;
            call_xhr('POST', '/user/file/' + this.file._id + "?extend_lifetime=1", null).then(function () {
                that.get_file(that.file._id)
            });
        },
        save_file_options() {
            const options = pick(this.file, this.modified_options)
            call_xhr('POST', '/user/file/' + this.file._id + "?" + encode_params_(options, ''), null).then(() => {
                this.modified_options = []
            });
        },
        formatBytes: formatBytes,
        dateToLocaleString: function (o) { return new Date(o).toLocaleString() },
    },
}).mount("#main");