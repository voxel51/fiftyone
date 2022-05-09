import typing as t

import strawberry as gql


@gql.input
class ViewExpression:
    operand: "ViewExpressionOperand"
    operator: t.Optional["ViewExpressionOperator"]


@gql.input
class ViewExpressionOperand:
    field: t.Optional[str]
    literal: t.Optional[str]
    expr: t.Optional["ViewExpression"]


@gql.input
class ViewExpressionOperator:
    Eq: t.Optional["Eq"]
    Call: t.Optional["Call"]
    Ne: t.Optional["Ne"]
    Ge: t.Optional["Ge"]
    Gt: t.Optional["Gt"]
    Le: t.Optional["Le"]
    Lt: t.Optional["Lt"]
    Exists: t.Optional["Exists"]
    Invert: t.Optional["Invert"]
    And: t.Optional["And"]
    Rand: t.Optional["Rand"]
    Or: t.Optional["Or"]
    Ror: t.Optional["Ror"]
    Abs: t.Optional["Abs"]
    Add: t.Optional["Add"]
    Ceil: t.Optional["Ceil"]
    Floor: t.Optional["Floor"]
    Round: t.Optional["Round"]


@gql.input
class Call:
    field: str


@gql.input
class Eq:
    other: ViewExpression


@gql.input
class Ne:
    other: ViewExpression


@gql.input
class Ge:
    other: ViewExpression


@gql.input
class Gt:
    other: ViewExpression


@gql.input
class Le:
    other: ViewExpression


@gql.input
class Lt:
    other: ViewExpression


@gql.input
class Exists:
    bool: t.Optional[bool]


@gql.input
class Invert:
    pass


@gql.input
class And:
    other: ViewExpression


@gql.input
class Rand:
    other: ViewExpression


@gql.input
class Or:
    other: ViewExpression


@gql.input
class Ror:
    other: ViewExpression


@gql.input
class Abs:
    pass


@gql.input
class Add:
    other: ViewExpression


@gql.input
class Ceil:
    pass


@gql.input
class Floor:
    pass


@gql.input
class Round:
    pass


@gql.input
class Mod:
    other: ViewExpression


@gql.input
class Mul:
    other: ViewExpression


@gql.input
class Pow:
    power: ViewExpression


@gql.input
class Radd:
    other: ViewExpression


@gql.input
class Rmod:
    other: ViewExpression


@gql.input
class Rmul:
    other: ViewExpression


@gql.input
class Rsub:
    other: ViewExpression


@gql.input
class Rtruediv:
    other: ViewExpression


@gql.input
class Sub:
    other: ViewExpression


@gql.input
class Truediv:
    other: ViewExpression


@gql.input
class Trunc:
    place: ViewExpression


@gql.input
class Exp:
    pass


@gql.input
class Ln:
    pass


@gql.input
class Log:
    base: ViewExpression


@gql.input
class log10:
    pass


@gql.input
class Sqrt:
    pass


@gql.input
class Cos:
    pass


@gql.input
class Cosh:
    pass


@gql.input
class Sin:
    pass


@gql.input
class Sinh:
    pass


@gql.input
class Tan:
    pass


@gql.input
class Tanh:
    pass


@gql.input
class Arccos:
    pass


@gql.input
class Arccosh:
    pass


@gql.input
class Arcsin:
    pass


@gql.input
class Arcsinh:
    pass


@gql.input
class Arctan:
    pass


@gql.input
class Type:
    pass


@gql.input
class Arctanh:
    pass


@gql.input
class IsNull:
    pass


@gql.input
class IsNumber:
    pass


@gql.input
class IsString:
    pass


@gql.input
class IsArray:
    pass


@gql.input
class IsMissing:
    pass


@gql.input
class IsIn:
    values: 


@gql.input
class ToBool:
    pass


@gql.input
class ToInt:
    pass
