import {it,expect,vi} from 'vitest';
import {TaskFailureBanner} from '../src/TaskFailureBanner';
it('tên dài vẫn giữ nội dung đầy đủ để xem và nút Xem riêng cho từng hội thoại',()=>{
 const onView=vi.fn();
 const tasks=['chat-a','chat-b'].map(chatId=>({chatId,targetId:`message-${chatId}`,title:'Tên công việc rất dài '.repeat(40),reason:'Mất mạng\nVui lòng thử lại',at:1}));
 for(const task of tasks){
  const banner=TaskFailureBanner({task,onView});const [label,button]=banner.props.children;
  expect(banner.props.className).toBe('task-failure-banner');
  expect(label.props.title).toBe(`${task.title} bị gián đoạn: ${task.reason}`);
  expect(button.props.children).toBe('Xem');button.props.onClick();
 }
 expect(onView.mock.calls.map(call=>call[0])).toEqual(tasks);
});
it('Xem truyền đúng đích tác vụ, không gọi chạy lại',()=>{
 const task={chatId:'chat-2',targetId:'plan-p-s',title:'Soạn bài',reason:'Mất mạng',at:1};
 const onView=vi.fn();const banner=TaskFailureBanner({task,onView});
 const [label,button]=banner.props.children;
 expect(label.props.children).toBe('Soạn bài bị gián đoạn: Mất mạng');
 expect(button.props.children).toBe('Xem');expect(onView).not.toHaveBeenCalled();
 button.props.onClick();expect(onView).toHaveBeenCalledExactlyOnceWith(task);
});
