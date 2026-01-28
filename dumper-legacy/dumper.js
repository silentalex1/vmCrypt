const Utils = {
    isNode: (typeof process !== 'undefined' && process.versions && process.versions.node),
    cleanUnicode: (str) => {
        return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
                  .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    },
    safeEvalArray: (code) => {
        try {
            const match = code.match(/=\s*\[(.*?)\]/s);
            if (!match) return null;
            return new Function(`return [${match[1]}]`)();
        } catch (e) { return null; }
    }
};

class IR {
    constructor(op, args = []) {
        this.op = op;
        this.args = args;
        this.id = Math.random().toString(36).slice(2, 7);
    }
}

class VirtualMachine {
    constructor(bytecode, constants) {
        this.bytecode = bytecode;
        this.constants = constants;
        this.stack = [];
        this.instructions = [];
        this.ip = 0;
    }

    push(val) { this.stack.push(val); }
    pop() { return this.stack.pop() || { type: 'undefined' }; }

    lift() {
        let ops = 0;
        const maxOps = 50000;

        while (this.ip < this.bytecode.length && ops++ < maxOps) {
            const op = this.bytecode[this.ip++];
            
            switch (op % 9) { 
                case 0: 
                    const idx = this.bytecode[this.ip++];
                    const val = this.constants[idx];
                    this.push({ type: 'LITERAL', value: val });
                    break;

                case 1: 
                    const b1 = this.pop();
                    const a1 = this.pop();
                    this.push({ type: 'EXPR', op: '+', left: a1, right: b1 });
                    break;

                case 2: 
                    const b2 = this.pop();
                    const a2 = this.pop();
                    this.push({ type: 'EXPR', op: '-', left: a2, right: b2 });
                    break;

                case 3: 
                    const b3 = this.pop();
                    const a3 = this.pop();
                    this.push({ type: 'EXPR', op: '==', left: a3, right: b3 });
                    break;

                case 4: 
                    const cond = this.pop();
                    const target = this.bytecode[this.ip++];
                    this.instructions.push(new IR('JUMP_IF_FALSE', [cond, target]));
                    break;

                case 5: 
                    const func = this.pop();
                    this.instructions.push(new IR('CALL', [func]));
                    break;

                case 6: 
                    this.instructions.push(new IR('RETURN', []));
                    return; 

                case 7: 
                    const b7 = this.pop();
                    const a7 = this.pop();
                    this.push({ type: 'EXPR', op: '>', left: a7, right: b7 });
                    break;
                
                case 8: 
                    const val8 = this.pop();
                    this.instructions.push(new IR('PRINT', [val8]));
                    break;
            }
        }
    }

    getIR() {
        return this.instructions;
    }
}

class Decompiler {
    constructor(source) {
        this.source = source;
        this.stringTable = [];
        this.bytecode = [];
    }

    unpack() {
        const funcWrap = /Function\((?:'|")([\s\S]+?)(?:'|")\)/;
        const match = this.source.match(funcWrap);
        
        if (match) {
            try {
                let inner = match[1];
                inner = Utils.cleanUnicode(inner);
                inner = inner.replace(/[\u200B-\u200D\uFEFF]/g, '');
                return inner;
            } catch (e) {
                return this.source;
            }
        }
        return this.source;
    }

    extractData(code) {
        const constMatch = code.match(/(?:var|const|let)\s+([a-zA-Z_$][\w$\u200c]*)\s*=\s*\[([\s\S]*?)\];/);
        if (constMatch) {
            try {
                this.stringTable = new Function(`return [${constMatch[2]}]`)();
            } catch(e) {}
        }

        const rotateMatch = code.match(/\(function\s*\([^,]+,\s*([^)]+)\)\s*\{[\s\S]*?\}\s*\(.*,\s*(0x[0-9a-fA-F]+|[0-9]+)\s*\)\);/);
        if (rotateMatch) {
            const count = parseInt(rotateMatch[2]);
            this.rotateStringTable(count);
        }
    }

    rotateStringTable(count) {
        while (--count >= 0) {
            this.stringTable.push(this.stringTable.shift());
        }
    }

    rebuildCFG(code) {
        const switchRegex = /switch\s*\(\s*['"]((?:\d+\|?)+)['"]\s*\['split'\]\(['"]\|['"]\)\s*\)\s*\{([\s\S]+?)\}\s*break;/g;
        
        return code.replace(switchRegex, (match, seqStr, body) => {
            const sequence = seqStr.split('|');
            const cases = {};
            
            const caseRegex = /case\s+['"]?(\d+)['"]?:\s*([\s\S]+?)(?:break;|continue;)/g;
            let m;
            while ((m = caseRegex.exec(body)) !== null) {
                cases[m[1]] = m[2].trim();
            }

            return `{\n${sequence.map(id => cases[id] || ``).join('\n')}\n}`;
        });
    }

    unrollTernaries(code) {
        let prev = code;
        for (let i = 0; i < 5; i++) { 
            code = code.replace(/([a-zA-Z0-9_$\[\]().]+)\s*\?\s*([a-zA-Z0-9_$\[\]().=\s]+)\s*:\s*([a-zA-Z0-9_$\[\]().=\s]+);/g, 
                (m, c, t, f) => {
                    if (m.includes('var ') || m.includes('return ')) return m;
                    return `if (${c}) { ${t}; } else { ${f}; }`;
                }
            );
            if (code === prev) break;
            prev = code;
        }
        return code;
    }

    run() {
        let stage = this.unpack();
        
        stage = Utils.cleanUnicode(stage);
        
        this.extractData(stage);

        if (this.stringTable.length > 0) {
            const getterRegex = /([a-zA-Z_$][\w$]*)\s*\(\s*(0x[0-9a-fA-F]+|[0-9]+)\s*\)/g;
            
            const offsetMatch = stage.match(/return\s+[a-zA-Z_$]+\s*\[\s*[a-zA-Z_$]+\s*-\s*(0x[0-9a-fA-F]+|[0-9]+)\s*\]/);
            const offset = offsetMatch ? parseInt(offsetMatch[1]) : 0;

            stage = stage.replace(getterRegex, (match, name, arg) => {
                const idx = parseInt(arg) - offset;
                const val = this.stringTable[idx];
                return val !== undefined ? JSON.stringify(val) : match;
            });
        }

        stage = this.rebuildCFG(stage);
        stage = this.unrollTernaries(stage);

        return this.beautify(stage);
    }

    beautify(code) {
        let indent = 0;
        const lines = code.split(/[{};]/);
        let res = "";
        
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            
            if (line.includes('}')) indent = Math.max(0, indent - 1);
            
            res += "    ".repeat(indent) + line + ";\n";
            
            if (line.includes('{')) indent++;
        }
        
        return res
            .replace(/;\s*;/g, ';')
            .replace(/;{/g, ' {')
            .replace(/}\s*else/g, '} else');
    }
}

class Notification {
    static show(title, message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = type === 'success' 
            ? '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />'
            : '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />';

        toast.innerHTML = `
            <div class="toast-icon-box"><svg class="icon-svg" viewBox="0 0 24 24">${icon}</svg></div>
            <div class="toast-content"><span class="toast-title">${title}</span><span class="toast-message">${message}</span></div>
            <div class="toast-progress" style="animation-duration: 3000ms"></div>
        `;

        container.appendChild(toast);
        
        requestAnimationFrame(() => toast.classList.add('visible'));

        setTimeout(() => {
            toast.classList.remove('visible');
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const codeInput = document.getElementById('code-input');
    const btnDeobf = document.getElementById('btn-deobfuscate');
    const btnReset = document.getElementById('reset-btn');
    const statusBar = document.getElementById('status-bar');

    if (codeInput) {
        codeInput.addEventListener('input', () => {
            const s = codeInput.value.length;
            statusBar.innerText = s > 1024 * 1024 
                ? (s / (1024 * 1024)).toFixed(2) + " MB" 
                : (s / 1024).toFixed(2) + " KB";
        });
    }

    if (btnReset) {
        btnReset.addEventListener('click', () => {
            codeInput.value = "";
            statusBar.innerText = "0 B / 50 MB";
        });
    }

    if (btnDeobf) {
        btnDeobf.addEventListener('click', () => {
            const raw = codeInput.value;
            
            if (!raw.trim()) {
                Notification.show("Input Error", "Please paste the obfuscated code first.", "error");
                return;
            }
            
            const originalText = btnDeobf.innerText;
            btnDeobf.innerText = "Analyzing...";
            btnDeobf.disabled = true;

            setTimeout(() => {
                try {
                    const engine = new Decompiler(raw);
                    const result = engine.run();
                    
                    codeInput.value = result;
                    Notification.show("Success", "Code deobfuscated successfully.");
                    statusBar.innerText = "Analysis Complete";
                } catch (e) {
                    console.error(e);
                    Notification.show("Analysis Failed", "Could not reconstruct the logic.", "error");
                    codeInput.value += `\n\n// Error: ${e.message}`;
                } finally {
                    btnDeobf.innerText = originalText;
                    btnDeobf.disabled = false;
                }
            }, 50);
        });
    }
});
