const CallFrame = require('./callframe.js');
const builtIn = require('./builtin.js');
const { valToNumber, valToBool } = require('./utils.js');
const StandardIO = require('./standardio.js');

// Classes de erros
const {
  NotImplementedError,
  DivisionByZeroError,
  NotFoundVarError,
  NotFoundFunctionError,
  NotAFunctionError,
  IncorrectArgNumberError,
} = require('../errors.js');

class Interpreter {
  constructor(io = StandardIO) {
    this.callStack = [new CallFrame()];
    this.builtIn = builtIn;
    this.io = io;
  }

  // Variable manipulation funtions
  findVar(name) {
    if (this.callStack[this.callStack.length - 1].findVar(name) !== undefined) {
      return this.callStack[this.callStack.length - 1].findVar(name);
    }
    if (this.callStack[0].findVar(name) !== undefined) {
      return this.callStack[0].findVar(name);
    }
    return null;
  }

  setVar(name, type, value) {
    if (!this.callStack[this.callStack.length - 1].setVarAndCheckExistence(name, type, value)) {
      if (!this.callStack[0].setVarAndCheckExistence(name, type, value)) {
        throw new NotFoundVarError(name);
      }
    }
  }

  declVar(name, type, value) {
    this.callStack[this.callStack.length - 1].declVar(name, type, value);
  }

  visitVarDecl(node) {
    this.declVar(node.name, 'Number', this.visit(node.value));
    return null;
  }

  visitVarSet(node) {
    this.setVar(node.name, 'Number', this.visit(node.value));
    return null;
  }

  // Funções que servem para dar parsing em cada tipo de nó da arvore sintática
  visitCompound(node) {
    this.callStack[this.callStack.length - 1].frames.push({});
    let val = null;
    for (let i = 0; i < node.code.length; i += 1) {
      val = this.visit(node.code[i]);
    }
    this.callStack[this.callStack.length - 1].frames.pop();
    return val;
  }

  visitCall(node) {
    const { name } = node;
    const args = node.args.map((a) => this.visit(a));
    if (this.builtIn[name]) {
      this.builtIn[name].run(this, ...args);
    } else {
      const value = this.findVar(name);

      if (value === undefined || value === null) {
        throw new NotFoundFunctionError(`Função ${name} não encontrada!`);
      }
      if (value.type !== 'Function') {
        throw new NotAFunctionError(value);
      }
      const func = value.value;

      if (func.args.length !== args.length) {
        throw new IncorrectArgNumberError(args.length, value.args.length);
      }

      this.callStack.push(new CallFrame());
      for (let i = 0; i < func.args.length; i += 1) {
        this.declVar(func.args[i], 'Number', args[i]);
      }
      let val = null;
      for (let i = 0; i < func.compound.code.length; i += 1) {
        val = this.visit(func.compound.code[i]);
      }

      this.callStack.pop();
      return val;
    }
    return null;
  }

  visitId(node) {
    const value = this.findVar(node.value);
    if (value === undefined || value === null) {
      throw new NotFoundVarError(node.value, node.pos);
    }
    return value.value;
  }

  visitProgram(node) {
    let val = null;
    for (let i = 0; i < node.statements.length; i += 1) {
      val = this.visit(node.statements[i]);
    }
    return val;
  }

  visitIf(node) {
    if (this.visit(node.condition).value) {
      return this.visit(node.compound);
    }
    if (node.elseCompound) {
      return this.visit(node.elseCompound);
    }

    return { type: 'Nil', value: 'Nil' };
  }

  visitFunction(node) {
    this.declVar(node.name, 'Function', node);
    return { type: 'Nil', value: 'Nil' };
  }

  visitOpSum(node) {
    const x = this.visit(node.left);
    const y = this.visit(node.right);
    if (x.type === y.type && x.type === 'String') {
      return { type: 'String', value: x.value + y.value };
    }
    const xval = valToNumber(x, '+', 'Number').value;
    const yval = valToNumber(y, '+', 'Number').value;
    return { type: 'Number', value: xval + yval };
  }

  visitEqual(node) {
    const x = this.visit(node.left);
    const y = this.visit(node.right);
    if (x.type === y.type && x.value === y.value) {
      return { type: 'Bool', value: true };
    }
    return { type: 'Bool', value: false };
  }

  visitBinaryMathOperation(node, op, name) {
    const x = valToNumber(this.visit(node.left), name, 'Number');
    const y = valToNumber(this.visit(node.right), name, 'Number');
    return { type: 'Number', value: op(x, y) };
  }

  visitBinaryComparisonOperation(node, op) {
    const x = valToNumber(this.visit(node.left), op);
    const y = valToNumber(this.visit(node.right), op);
    return { type: 'Bool', value: op(x, y) };
  }

  visitUnary(node) {
    switch (node.op) {
      case '-':
        return { type: 'Number', value: -valToNumber(this.visit(node.value), '+').value };
      case '+':
        return { type: 'Number', value: +valToNumber(this.visit(node.value), '+').value };
      case '!':
        return { type: 'Number', value: !valToBool(this.visit(node.value), '+').value };
      default:
        throw new NotImplementedError(node);
    }
  }

  visit(node) {
    switch (node.type) {
      case 'Compound': return this.visitCompound(node);
      case 'Call': return this.visitCall(node);
      case 'Identifier': return this.visitId(node);
      case 'Program': return this.visitProgram(node);
      case 'VarSet': return this.visitVarSet(node);
      case 'VarDecl': return this.visitVarDecl(node);
      case 'Function': return this.visitFunction(node);
      case 'If': return this.visitIf(node);
      case 'Bool':
      case 'String': return node;
      case 'Number': return { type: 'Number', value: parseInt(node.value, 10) };
      case '+': return this.visitOpSum(node);
      case '-': return this.visitBinaryMathOperation(node, (x, y) => x.value - y.value, '-');
      case '*': return this.visitBinaryMathOperation(node, (x, y) => x.value * y.value, '*');
      case '^': return this.visitBinaryMathOperation(node, (x, y) => x.value ** y.value, '^');
      case '/': return this.visitBinaryMathOperation(node, (x, y) => {
        if (y.value === 0) throw new DivisionByZeroError(y.pos);
        return x.value / y.value;
      }, '/');
      case '>': return this.visitBinaryComparisonOperation(node, (x, y) => x.value > y.value);
      case '<': return this.visitBinaryComparisonOperation(node, (x, y) => x.value < y.value);
      case '>=': return this.visitBinaryComparisonOperation(node, (x, y) => x.value >= y.value);
      case '<=': return this.visitBinaryComparisonOperation(node, (x, y) => x.value <= y.value);
      case '==': return this.visitEqual(node);
      case '!=': return { type: 'Bool', value: !this.visitEqual(node).value };
      case 'Nil': return node;
      case 'Unary': return this.visitUnary(node);
      case 'Array': return { type: 'Array', values: node.values.map((a) => this.visit(a)) };
      default:
        throw new NotImplementedError(node);
    }
  }

  run(node) {
    return this.visit(node);
  }
}

module.exports = Interpreter;
