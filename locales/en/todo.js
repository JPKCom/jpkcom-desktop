/* JPKCom Desktop — tasks strings: English (reference locale) — © Jean Pierre Kolb — MIT License

   Namespace 'todo' (src/apps/todo). {keys}: a modifier key as the user reads it
   (i18n.keys('Alt') → 'Alt' or '⌥'); {name}: a task's text. status and countOpen
   join already translated counts (statusOpen, statusDone, tasks), so each count
   gets its own plural form. */
export default {
	appName: 'Tasks',
	appDesc: 'A simple to-do list',
	add: 'Add',
	placeholder: 'New task',
	list: 'Tasks',
	filter: 'Filter',
	all: 'All',
	open: 'Open',
	done: 'Done',
	move: 'Move ({keys} + arrow keys)',
	edit: 'Edit task',
	deleteNamed: 'Move to Trash: {name}',
	/* Two counts, each with its own plural form, joined by a template */
	status: '{open} · {done}',
	statusOpen: { one: '{n} open', other: '{n} open' },
	statusDone: { one: '{n} done', other: '{n} done' },
	clear: 'Remove completed',
	emptyAll: 'No tasks — add the first one above',
	emptyOpen: 'All done',
	emptyDone: 'Nothing done yet',
	countOpen: '{tasks} ({open})',
	tasks: { one: '{n} task', other: '{n} tasks' },
	resetHint: 'The task list',
	trashType: 'Task'
};
