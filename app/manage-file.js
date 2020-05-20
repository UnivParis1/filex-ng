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
    },
    filters: {
        formatBytes: formatBytes,
        dateToLocaleString: function (o) { return new Date(o).toLocaleString() },
    },
}).$mount("#main");