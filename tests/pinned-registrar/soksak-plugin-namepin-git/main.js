// A consumer that quotes the contract and pins the name anyway — the defect the audit must catch.
const GIT_CONTRACT = "soksak-git-spec";

export default {
  activate(ctx) {
    ctx.app.commands.execute("plugin.implementers", { contract: GIT_CONTRACT });
    // …and then calls the implementer by name regardless. The discovery above was decoration.
    ctx.app.commands.execute("plugin.soksak-plugin-any-git.status", {});
  },
  deactivate() {},
};
