import React, {PropTypes} from 'react';
import {connect} from 'react-redux';
//import {bindActionCreators} from 'redux';
import TodoItem from './todoItem.js';
import {toggleTodo, removeTodo} from '../actions.js';
import {FilterTypes} from '../../constants.js';
import * as Status from '../status';

const TodoList = ({status, todos, onToggleTodo, onRemoveTodo}) => {
  let view = null
  switch (status) {
    case Status.LOADING:
      {
        view = (
          <div>
            <span>Todo LIst信息请求中...</span>
          </div>
        );
        break
      }
    case Status.SUCCESS:
      {
        view = (
          <ul className="todo-list">
            {todos.map((item) => (<TodoItem
              key={item.id}
              text={item.text}
              completed={item.completed}
              onToggle={() => onToggleTodo(item.id)}
              onRemove={() => onRemoveTodo(item.id)}/>))
}
          </ul>
        )
        break
      }
    case Status.FAILURE:
      {
        view = (
          <div>Todo List装载失败</div>
        )
        break
      }
  }
  return view;
};

TodoList.propTypes = {
  todos: PropTypes.array,
  status: PropTypes.string.isRequired
};

const selectVisibleTodos = (todos = [], filter = FilterTypes.ALL) => {
  switch (filter) {
    case FilterTypes.ALL:
      return todos;
    case FilterTypes.COMPLETED:
      return todos.filter(item => item.completed);
    case FilterTypes.UNCOMPLETED:
      return todos.filter(item => !item.completed);
    default:
      throw new Error('unsupported filter');
  }
}

const mapStateToProps = (state) => {
  return {
    todos: selectVisibleTodos(state.todos.todos, state.filter),
    status: state.todos.status
  };
}

const mapDispatchToProps = (dispatch) => {
  return {
    onToggleTodo: (id) => {
      dispatch(toggleTodo(id));
    },
    onRemoveTodo: (id) => {
      dispatch(removeTodo(id));
    }
  };
};

/*
const mapDispatchToProps = (dispatch) => bindActionCreators({
  onToggleTodo: toggleTodo,
  onRemoveTodo: removeTodo
}, dispatch);
*/

export default connect(mapStateToProps, mapDispatchToProps)(TodoList)
