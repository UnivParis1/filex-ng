Vue.createApp({
    data: () => ({ exemptions: undefined }),
    created() { this.get_exemptions() },
    methods: {
        async get_exemptions() {
            this.exemptions = await call_xhr('GET', '/exemptions', null)
        },
        create_new() {
            this.exemptions.push({ userid: "", is_new: true })
        },
        async remove(exemption) {
            await call_xhr('DELETE', '/exemptions/' + exemption.userid)
            this.get_exemptions()
        },
    },
}).component('exemption', {
    props: ['e'], emits: ['remove'],
    template: `
      <td>{{dateToLocaleString(e.modifyTimestamp)}}</td>
      <td>
        <span v-if="!e.is_new">{{e.userid}}</span>
        <input v-else placeholder="Identifiant" v-model="e.userid">
      </td>
      <td><input placeholder="valeur par défaut" v-model="e.admin" type="checkbox"></td>
      <td><input placeholder="valeur par défaut" v-model.number="e.max_daykeep" type="number" min="1" class="align-right"></td>
      <td><input placeholder="valeur par défaut" v-model="e.quota" size="9" class="align-right"></td>
      <td><input v-model="e.description" size="30"></td>
      <td><button @click="save()" :disabled="prev === this.e_to_detect_changes">Sauvegarder</button></td>
      <td><button @click="$emit('remove')">Supprimer</button></td>
    `,
    data: () => ({ prev: undefined }),
    created() { this.prev = this.e_to_detect_changes },
    computed: {
        e_to_detect_changes() {
            const { modifyTimestamp, ...snapshot } = this.e
            return JSON.stringify(snapshot)
        },
    },
    methods: {
        async save() {
            const { userid, is_new, ...params } = this.e
            await call_xhr('PUT', '/exemptions/' + userid + '?' + encode_params(params))
            this.prev = this.e_to_detect_changes
        },
        dateToLocaleString: (s) => s && new Date(s).toLocaleString(),
    },
}).mount("#main");
