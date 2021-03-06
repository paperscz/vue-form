import _ from 'lodash'
import objectpath from 'objectpath'
import rule from './rule'
import defaultRule from './rules/default'
import arrayRule from './rules/array'
import checkboxRule from './rules/checkbox'
import checkboxesRule from './rules/checkboxes'
import dateRule from './rules/date'
import fieldsetRule from './rules/fieldset'
import numberRule from './rules/number'
import selectRule from './rules/select'
import textRule from './rules/text'
import imageUploadRule from './rules/image-upload'

const rulesMap = {
  checkbox: checkboxRule,
  fieldset: fieldsetRule,
  checkboxes: checkboxesRule,
  array: arrayRule,
  number: numberRule,
  date: dateRule,
  select: selectRule,
  text: textRule,
  image: imageUploadRule
}

const BUILD_IN_TYPE = [
  'text',
  'select',
  'textarea',
  'html',
  'grid',
  'fieldset'
]

class Generator {
  constructor () {
    this.rules = {}
    this.init()
  }

  init () {
    const rules = {}

    _.each(rule, (list, type) => {
      rules[type] = list.map(item => {
        return rulesMap[item]
      })
    })

    this.rules = rules
  }

  /**
   * 给指定类型添加规则
   * @param {String} type data type
   * @param {Function} rule 规则
   * @param {Number} idx 添加位置，不提供则是添加到第一位
   */
  addRule (type, rule, idx = 0) {
    const rules = this.rules[type]

    if (!rules) {
      throw new Error(`不支持的类型: ${type}`)
    }

    rules.splice(idx, 0, rule)
  }

  /**
   * 生成表单模型
   * @param {Object} schema 
   * @param {Array} definition 
   */
  parse (schema, definition = []) {
    if (!(schema && schema.properties)) {
      throw new Error('schema no validate!')
    }

    const options = {path: [], lookup: {}}
    const schemaForm = []

    _.each(schema.properties, (val, key) => {
      const required = schema.required && _.indexOf(schema.required, key) !== -1

      this._parse(key, val, schemaForm, {
        path: [key],
        required: required,
        lookup: options.lookup
      })
    })

    // 再根据form definition合并form schema
    if (definition.length) {
      definition = combine(definition, schemaForm, options.lookup)
    } else {
      definition = schemaForm
    }

    return definition
  }

  /**
   * 生成表单模型
   * @param {Object} schema 
   * @param {Array} definition 
   */
  _parse (name, schema, definition, options) {
    const rules = this.rules[schema.type]
    let def

    if (rules) {
      def = defaultRule(name, schema, options)

      for (let i = 0, len = rules.length; i < len; i++) {
        rules[i].call(this, def, schema, options)

        if (def.type) {
          break
        }
      }
    }

    definition.push(def)
  }

  getDefaultModal (schema) {
    const model = {}
    
    _.each(schema.properties, function (val, key) {
      defaultValue(val, key, model)
    })

    return model
  }
}

function defaultValue (schema, key, model) {
  var type = schema.type

  if (type === 'object') {
    model[key] = {}

    _.each(schema.properties, function (val, _key) {
      defaultValue(val, _key, model[key])
    })
  } else if (type === 'array') {
    model[key] = []
    if (schema.items) {
      defaultValue(schema.items, 0, model[key])
    }
  } else {
    if (schema.default) {
      model[key] = schema.default
    }
  }
}

// 合并form definition & schemaForm
function combine (form, schemaForm, lookup) {
  const idx = _.indexOf(form, '*')

  // 用schema生成的默认定义
  if (idx === 0) {
    return schemaForm
  }

  // Important: 存在*就意味着使用schema生成的默认定义，只是在前后做一定的扩展，如果此时存在同名定义，就会存在两个定义。
  if (idx !== -1) {
    form = form.slice(0, idx).concat(schemaForm).concat(form.slice(idx + 1))

    return form
  }

  const definition = []

  _.each(form, obj => {
    if (typeof obj === 'string') {
      obj = {
        key: obj
      }
    }

    if (obj.key && typeof obj.key === 'string') {
      obj.key = obj.key.replace(/\[\]/g, '.$index')
      obj.key = objectpath.parse(obj.key)
    }

    // if (def.options) {
    //   def.options = formatOptions(obj.options)
    // }
    let def

    // extend with schema form from schema
    if (obj.key) {
      const path = objectpath.stringify(obj.key)
      def = lookup[path]

      if (def) {
        _.each(def, function (val, key) {
          if (typeof obj[key] === 'undefined') {
            obj[key] = val
          }
        })
      }
    }

    // 保留html,添加v-前缀
    if (_.indexOf(BUILD_IN_TYPE, obj.type) > -1) {
      obj.type = 'v-' + obj.type
    }

    if (obj.items) {
      if (def) {
        obj.items = combine(obj.items, def.items, lookup)
      } else {
        obj.items = combine(obj.items, schemaForm, lookup)
      }
    }

    definition.push(obj)
  })

  return definition
}

export default Generator
