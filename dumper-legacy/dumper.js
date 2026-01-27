class VMState {
    constructor() {
        this.stack = [];
        this.vars = Object.create(null);
        this.ip = 0;
        this.output = [];
    }
}

class VMAnalyzer {
    constructor(code) {
        this.code = code;
        this.handlers = Object.create(null);
        this.bytecode = [];
        this.constants = [];
    }

    extract() {
        const bc = /var\s+([a-zA-Z_$][\w$]*)\s*=\s*\[([^\]]+)\]/g;
        let m;
        while ((m = bc.exec(this.code))) {
            this.bytecode = new Function(`return [${m[2]}]`)();
        }
        const cn = /const\s+([a-zA-Z_$][\w$]*)\s*=\s*\[([^\]]+)\]/g;
        while ((m = cn.exec(this.code))) {
            this.constants = new Function(`return [${m[2]}]`)();
        }
    }

    mapHandlers() {
        const fn = /function\s+([a-zA-Z_$][\w$]*)\s*\(\)\s*\{([\s\S]*?)\}/g;
        let m;
        while ((m = fn.exec(this.code))) {
            if (/stack|ip|push|pop/.test(m[2])) {
                this.handlers[m[1]] = m[2];
            }
        }
    }

    execute() {
        const state = new VMState();
        const visited = new Set();
        while (state.ip < this.bytecode.length) {
            if (visited.has(state.ip)) break;
            visited.add(state.ip);
            const op = this.bytecode[state.ip++];
            const handler = this.handlers[op];
            if (!handler) continue;
            const fn = new Function("s","c",handler);
            fn(state,this.constants);
        }
        return state.output.join("\n");
    }
}

class CFGRebuilder {
    static rebuild(code) {
        const blocks = {};
        const cases = /case\s+['"]?(\d+)['"]?:([\s\S]*?)(?:break|continue)/g;
        let m;
        while ((m = cases.exec(code))) {
            blocks[m[1]] = m[2].trim();
        }
        const order = code.match(/['"](\d+(?:\|\d+)*)['"]/)?.[1]?.split("|") || [];
        return order.map(i => blocks[i]).filter(Boolean).join("\n");
    }
}

class StringResolver {
    constructor(code) {
        this.code = code;
        this.map = Object.create(null);
    }

    build() {
        const arr = /var\s+([a-zA-Z_$][\w$]*)\s*=\s*\[([^\]]+)\]/.exec(this.code);
        if (!arr) return;
        const a = new Function(`return [${arr[2]}]`)();
        const fn = /function\s+([a-zA-Z_$][\w$]*)\s*\(\w+\)\s*\{\s*return\s+[a-zA-Z_$][\w$]*\[\w+\s*-\s*(\d+)\]/.exec(this.code);
        if (!fn) return;
        const off = parseInt(fn[2]);
        for (let i = 0; i < a.length; i++) this.map[i + off] = a[i];
    }

    apply(code) {
        return code.replace(/\b[a-zA-Z_$][\w$]*\((\d+)\)/g,(m,n)=>{
            const v = this.map[n];
            return v !== undefined ? JSON.stringify(v) : m;
        });
    }
}

class DeobfuscationEngine {
    constructor(input) {
        this.input = input;
    }

    run() {
        let c = this.input
            .replace(/\\x([0-9a-fA-F]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16)))
            .replace(/\\u([0-9a-fA-F]{4})/g,(_,h)=>String.fromCharCode(parseInt(h,16)))
            .replace(/\[['"]([a-zA-Z_$][\w$]*)['"]\]/g,".$1");

        const strings = new StringResolver(c);
        strings.build();
        c = strings.apply(c);

        c = CFGRebuilder.rebuild(c) || c;

        const vm = new VMAnalyzer(c);
        vm.extract();
        vm.mapHandlers();
        const out = vm.execute();
        if (out) c += "\n" + out;

        return c.split("\n").map(l=>l.trim()).filter(Boolean).join("\n");
    }
}

document.getElementById("btn-deobfuscate").onclick = () => {
    const el = document.getElementById("code-input");
    el.value = new DeobfuscationEngine(el.value).run();
};
