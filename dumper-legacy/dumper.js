class Node {
    render() { return ""; }
}

class Lit extends Node {
    constructor(val) { super(); this.val = val; }
    render() {
        if (this.val === null) return "null";
        if (typeof this.val === 'string') return JSON.stringify(this.val);
        return String(this.val);
    }
}

class Ident extends Node {
    constructor(name) { super(); this.name = name; }
    render() { return this.name; }
}

class BinOp extends Node {
    constructor(left, op, right) { super(); this.left = left; this.op = op; this.right = right; }
    render() { return `(${this.left.render()} ${this.op} ${this.right.render()})`; }
    simplify() {
        if (this.left instanceof Lit && this.right instanceof Lit) {
            const l = this.left.val;
            const r = this.right.val;
            try {
                if (typeof l === 'number' && typeof r === 'number') {
                    if (this.op === '+') return new Lit(l + r);
                    if (this.op === '-') return new Lit(l - r);
                    if (this.op === '*') return new Lit(l * r);
                    if (this.op === '/') return new Lit(l / r);
                    if (this.op === '^') return new Lit(l ^ r);
                    if (this.op === '&') return new Lit(l & r);
                    if (this.op === '|') return new Lit(l | r);
                }
            } catch(e) {}
        }
        return this;
    }
}

class VMProcessor {
    constructor(source) {
        this.source = source;
        this.bytecode = [];
        this.consts = [];
        this.ops = {};
        this.pc = 0;
        this.instructions = [];
    }

    extractArrays() {
        const arrayPattern = /=\s*\[([^\]]+)\]/g;
        let match;
        const arrays = [];

        while ((match = arrayPattern.exec(this.source)) !== null) {
            try {
                const content = `[${match[1]}]`;
                const parsed = new Function('return ' + content)();
                if (Array.isArray(parsed) && parsed.length > 50) {
                    arrays.push(parsed);
                }
            } catch (e) { }
        }

        if (arrays.length === 0) return false;

        arrays.sort((a, b) => b.length - a.length);

        this.bytecode = arrays.find(a => a.every(x => typeof x === 'number')) || arrays[0];
        
        const constCandidates = arrays.filter(a => a !== this.bytecode && a.length > 10);
        if (constCandidates.length > 0) {
            this.consts = constCandidates[0];
        }
        
        return true;
    }

    mapOpcodes() {
        const switchRegex = /switch\s*\(\s*[\w_]+\s*\)\s*\{([\s\S]+?)\}/;
        const match = this.source.match(switchRegex);
        if (!match) return false;

        const body = match[1];
        const caseRegex = /case\s+(0x[0-9a-fA-F]+|\d+)\s*:/g;
        
        let lastIndex = 0;
        let lastOp = -1;
        let caseMatch;

        while ((caseMatch = caseRegex.exec(body)) !== null) {
            if (lastOp !== -1) {
                const codeSnippet = body.substring(lastIndex, caseMatch.index);
                this.analyzeHandler(lastOp, codeSnippet);
            }
            lastOp = parseInt(caseMatch[1]);
            lastIndex = caseRegex.lastIndex;
        }
        if (lastOp !== -1) {
            this.analyzeHandler(lastOp, body.substring(lastIndex));
        }
        return true;
    }

    analyzeHandler(op, code) {
        let kind = "UNKNOWN";
        let imm = false;
        const c = code.replace(/\s+/g, '');
        
        if (c.includes('push') && (c.includes('const') || c.includes('str'))) { kind = "PUSH"; imm = true; }
        else if (c.includes('return')) kind = "RET";
        else if (c.includes('console.log')) kind = "PRINT";
        else if (c.includes('ip=') || c.includes('pc=')) {
            kind = c.includes('if') ? "JMP_IF" : "JMP";
            imm = true;
        }
        else if (c.includes('push') && c.includes('pop')) {
            if (c.includes('+') && !c.includes('++')) kind = "ADD";
            else if (c.includes('-') && !c.includes('--')) kind = "SUB";
            else if (c.includes('*')) kind = "MUL";
            else if (c.includes('^')) kind = "XOR";
            else if (c.includes('==')) kind = "EQ";
            else if (c.includes('!')) kind = "NOT";
        }
        else if (c.includes('vars[') && c.includes('=')) {
            kind = "STORE"; imm = true;
        }
        else if (c.includes('vars[')) {
            kind = "LOAD"; imm = true;
        }
        
        this.ops[op] = { kind, imm };
    }

    async deobfuscate(mode, statusCb) {
        if (!this.extractArrays() || !this.mapOpcodes()) {
            return "// Error: Could not detect VM structure. Is this file standard?";
        }

        const maxSteps = mode === 'deep' ? 200000 : 10000;
        const output = [];
        const stack = [];
        let ip = 0;
        let step = 0;
        const labels = new Set();
        const instructions = [];

        output.push(`/* VMCrypt Dump - Mode: ${mode} */`);
        output.push(`/* Bytecode Size: ${this.bytecode.length} */`);
        output.push(`/* Constants Size: ${this.consts.length} */`);
        output.push("");

        while (ip < this.bytecode.length && step < maxSteps) {
            if (step % 1000 === 0 && statusCb) {
                statusCb(`Scanning... ${Math.round((ip/this.bytecode.length)*100)}%`);
                await new Promise(r => setTimeout(r, 0));
            }

            const currentIp = ip;
            if (labels.has(currentIp)) {
                 instructions.push({ type: 'LABEL', val: currentIp });
            }

            const op = this.bytecode[ip];
            const handler = this.ops[op];

            if (!handler) {
                ip++; continue;
            }

            let args = [];
            if (handler.imm) {
                ip++;
                if (ip < this.bytecode.length) args.push(this.bytecode[ip]);
            }

            let instr = { type: handler.kind, args: args, ip: currentIp };

            switch (handler.kind) {
                case "PUSH":
                    let val = args[0];
                    if (this.consts.length > 0 && typeof val === 'number' && val < this.consts.length) {
                        stack.push(new Lit(this.consts[val]));
                    } else {
                        stack.push(new Lit(val));
                    }
                    break;
                case "ADD":
                    if(stack.length >= 2) {
                        let b = stack.pop(); let a = stack.pop();
                        stack.push(new BinOp(a, "+", b).simplify());
                    }
                    break;
                case "SUB":
                    if(stack.length >= 2) {
                        let b = stack.pop(); let a = stack.pop();
                        stack.push(new BinOp(a, "-", b).simplify());
                    }
                    break;
                case "EQ":
                    if(stack.length >= 2) {
                        let b = stack.pop(); let a = stack.pop();
                        stack.push(new BinOp(a, "==", b).simplify());
                    }
                    break;
                case "PRINT":
                    if(stack.length > 0) {
                        instr.val = stack.pop();
                        instructions.push(instr);
                    }
                    break;
                case "JMP":
                    labels.add(args[0]);
                    instructions.push(instr);
                    break;
                case "JMP_IF":
                    if(stack.length > 0) instr.cond = stack.pop();
                    labels.add(args[0]);
                    instructions.push(instr);
                    break;
                case "STORE":
                    if(stack.length > 0) {
                        instr.val = stack.pop();
                        instructions.push(instr);
                    }
                    break;
                case "RET":
                    if(stack.length > 0) instr.val = stack.pop();
                    instructions.push(instr);
                    break;
            }
            
            ip++;
            step++;
        }

        instructions.forEach(ins => {
            if (ins.type === 'LABEL') {
                output.push(`\nL_${ins.val}:`);
            } else if (ins.type === 'PRINT') {
                output.push(`    console.log(${ins.val.render()});`);
            } else if (ins.type === 'STORE') {
                output.push(`    v${ins.args[0]} = ${ins.val.render()};`);
            } else if (ins.type === 'JMP') {
                output.push(`    goto L_${ins.args[0]};`);
            } else if (ins.type === 'JMP_IF') {
                output.push(`    if (${ins.cond ? ins.cond.render() : 'pop()'}) goto L_${ins.args[0]};`);
            } else if (ins.type === 'RET') {
                output.push(`    return ${ins.val ? ins.val.render() : 'null'};`);
            }
        });

        if (output.length <= 4) {
             return "// Analysis complete but no linear logic found.\n// This VM likely uses indirect dispatch or dynamic stack manipulation.";
        }

        return output.join("\n");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const codeInput = document.getElementById('code-input');
    const btnDeobf = document.getElementById('btn-deobfuscate');
    const btnReset = document.getElementById('reset-btn');
    const modeSelect = document.getElementById('mode-select');
    const statusBar = document.getElementById('status-bar');

    if (codeInput) {
        codeInput.addEventListener('input', () => {
            const size = new Blob([codeInput.value]).size;
            let readable = size + " B";
            if(size > 1024) readable = (size/1024).toFixed(2) + " KB";
            if(size > 1024*1024) readable = (size/(1024*1024)).toFixed(2) + " MB";
            statusBar.innerText = `${readable} / 50 MB`;
        });
    }

    if (btnReset) {
        btnReset.addEventListener('click', () => {
            codeInput.value = "";
            statusBar.innerText = "0 B / 50 MB";
        });
    }

    if (btnDeobf) {
        btnDeobf.addEventListener('click', async () => {
            const raw = codeInput.value;
            if (!raw.trim()) return alert("Please paste code first.");
            
            btnDeobf.disabled = true;
            const originalText = btnDeobf.innerText;
            btnDeobf.innerText = "Initializing...";

            try {
                await new Promise(r => setTimeout(r, 50));
                const engine = new VMProcessor(raw);
                const mode = modeSelect.value;
                
                const result = await engine.deobfuscate(mode, (status) => {
                    btnDeobf.innerText = status;
                });
                
                codeInput.value = result;
            } catch (e) {
                codeInput.value = "// Critical Error during analysis: " + e.message;
                console.error(e);
            } finally {
                btnDeobf.innerText = originalText;
                btnDeobf.disabled = false;
            }
        });
    }
});