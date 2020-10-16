new Vue({
    created() {
        this.get_file(document.location.hash.replace(/^#/, ''))
    },
    data: () => ({
            file: undefined,
    }),
    computed: {
    },
    methods: {
        get_file(id) {
            var that = this;
            call_xhr('GET', '/user/file/' + id, null).then(function (file) {
                that.file = file;
            }).catch(function (_resp) {
                document.location.href = "/manage";
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
        formatBytes: formatBytes,
        dateToLocaleString: function (o) { return new Date(o).toLocaleString() },
    },
}).$mount("#main");