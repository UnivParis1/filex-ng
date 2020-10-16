new Vue({
    created() {
        this.get_files();
    },
    data: () => ({
        files: undefined,
        hide_deleted: true,
    }),
    watch: {
        hide_deleted: 'get_files',
    },
    computed: {
        files_size() {
            return array_sum(this.files.map(function (file) { return file.size }));
        },
    },
    methods: {
        get_files() {
            var that = this;
            call_xhr('GET', '/user/files?include_deleted=' + !this.hide_deleted, null).then(function (files) {
                that.files = files;
            })    
        },
        formatBytes: formatBytes,
        dateToLocaleString: function (o) { return new Date(o).toLocaleString() },
    },
}).$mount("#main");