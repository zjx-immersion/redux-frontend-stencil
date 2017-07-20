import {
  ADD_TODO,
  TOGGLE_TODO,
  REMOVE_TODO,
  FETCH_STARTED,
  FETCH_SUCCESS,
  FETCH_FAILURE
} from './actionTypes.js';
import * as Status from './status.js';

export default(state = [], action) => {
  switch (action.type) {
    case ADD_TODO:
      {
        return {
          status: Status.SUCCESS,
          todos: [
            {
              id: action.id,
              text: action.text,
              completed: false
            },
            ...state.todos
          ]
        }
      }
    case TOGGLE_TODO:
      {

        let todos = state
          .todos
          .map((todoItem) => {
            if (todoItem.id === action.id) {
              return {
                ...todoItem,
                completed: !todoItem.completed
              };
            } else {
              return todoItem;
            }
          })
        return {status: Status.SUCCESS, todos}
      }
    case REMOVE_TODO:
      {
        let todos = state.todos.filter((todoItem) => {
          return todoItem.id !== action.id;
        })
        return {status: Status.SUCCESS, todos}
      }
    case FETCH_STARTED:
      {
        return {
          status: Status.LOADING,
          ...action
        };
      }
    case FETCH_SUCCESS:
      {
        return {
          status: Status.SUCCESS,
          ...action
        };
      }
    case FETCH_FAILURE:
      {
        return {
          status: Status.FAILURE,
          ...action
        };
      }
    default:
      {
        return state;
      }
  }
}
