new Vue({
    created() {
        var that = this;
        call_xhr('GET', '/user/file/' + document.location.hash.replace(/^#/, ''), null).then(function (file) {
            that.file = file;
        })
    },
    data: {
        file: undefined,
    },
    computed: {
    },
    methods: {
        delete_file() {
            call_xhr('DELETE', '/user/file/' + this.file._id, null).then(function () {
                alert("Fichier supprimé");
                document.location.href = "/manage";
            });
        },
    },
    filters: {
        formatBytes: formatBytes,
        dateToLocaleString: function (o) { return new Date(o).toLocaleString() },
    },
}).$mount("#main");