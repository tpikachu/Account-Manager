import React, {FC, ReactNode, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {useSelector} from 'react-redux';
import {NavLink, useLocation} from 'react-router-dom';
import clsx from 'clsx';
import reverse from 'lodash/reverse';
import sortBy from 'lodash/sortBy';

import Icon, {IconType} from '@renderer/components/Icon';
import {useBooleanState} from '@renderer/hooks';
import {getManagedAccounts, getManagedFriends} from '@renderer/selectors';
import {displayErrorToast} from '@renderer/utils/toast';

import TopNavNotificationsMenu from './TopNavNotificationsMenu';
import './TopNavNotifications.scss';

const dropdownRoot = document.getElementById('dropdown-root')!;

interface MenuNotification {
  notificationTime: number;
  notificationType: string;
  payload: any;
}

const TopNavNotifications: FC = () => {
  const {pathname} = useLocation();
  const [lastReadTime, setLastReadTime] = useState<number>(new Date().getTime());
  const [menuNotifications, setMenuNotifications] = useState<MenuNotification[]>([]);
  const [open, toggleOpen, , closeMenu] = useBooleanState(false);
  const [websockets, setWebsockets] = useState([]);
  const iconRef = useRef<HTMLDivElement>(null);
  const managedAccounts = useSelector(getManagedAccounts);
  const managedFriends = useSelector(getManagedFriends);

  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

  useEffect(() => {
    const sockets: any = Object.values(managedAccounts).map(
      ({account_number}) => new WebSocket(`ws://143.110.137.54/ws/confirmation_blocks/${account_number}`),
    );
    setWebsockets(sockets);
    return () => {
      sockets.forEach((socket: any) => socket.close());
    };
  }, [managedAccounts]);

  const getAccountNickname = (accountNumber: string): string => {
    const managedAccount = managedAccounts[accountNumber];

    if (managedAccount) {
      return managedAccount.nickname
        ? truncate(managedAccount.nickname, 16)
        : truncate(managedAccount.account_number, 8);
    }

    const managedFriend = managedFriends[accountNumber];

    if (managedFriend) {
      return managedFriend.nickname ? truncate(managedFriend.nickname, 16) : truncate(managedFriend.account_number, 8);
    }

    return accountNumber;
  };

  const handleBellClick = (): void => {
    if (open) {
      updateLastReadTime();
      closeMenu();
    } else {
      toggleOpen();
    }
  };

  const handleMenuClose = (): void => {
    updateLastReadTime();
    closeMenu();
  };

  useEffect(() => {
    websockets.forEach((socket: any) => {
      socket.onmessage = (event: any) => {
        try {
          const notification = JSON.parse(event.data);

          if (notification.notification_type === 'CONFIRMATION_BLOCK_NOTIFICATION') {
            const blockIdentifiers = menuNotifications
              .filter(({notificationType}) => notificationType === 'CONFIRMATION_BLOCK_NOTIFICATION')
              .map((confirmationBlockNotification) => confirmationBlockNotification.payload.message.block_identifier);

            const blockIdentifier = notification.payload.message.block_identifier;
            if (blockIdentifiers.includes(blockIdentifier)) return;
          }

          const time = new Date().getTime();
          setMenuNotifications([
            {
              notificationTime: time,
              notificationType: notification.notification_type,
              payload: notification.payload,
            },
            ...menuNotifications,
          ]);
        } catch (error) {
          displayErrorToast(error);
        }
      };
    });
  }, [menuNotifications, websockets]);

  const renderNotifications = (): ReactNode[] => {
    let notifications = menuNotifications.filter(
      ({notificationType}) => notificationType === 'CONFIRMATION_BLOCK_NOTIFICATION',
    );
    notifications = sortBy(notifications, ['notificationTime']);
    notifications = reverse(notifications);

    return notifications.map(({notificationTime, payload}) => {
      const {
        message: {
          block: {
            account_number: senderAccountNumber,
            message: {txs},
          },
        },
      } = payload;

      return txs.map(({amount, recipient}: any) => (
        <div className="TopNavNotifications__notification" key={recipient}>
          <Icon
            className={clsx('TopNavNotifications__Icon', {
              'TopNavNotifications__Icon--read': lastReadTime > notificationTime,
            })}
            icon={IconType.checkboxBlankCircle}
            size={8}
          />
          <div className="TopNavNotifications__right">
            <div className="TopNavNotifications__description">
              <div>
                <NavLink className="TopNavNotifications__NavLink" to={`/account/${senderAccountNumber}/overview`}>
                  {getAccountNickname(senderAccountNumber)}
                </NavLink>{' '}
                paid you{' '}
                <NavLink className="TopNavNotifications__NavLink" to={`/account/${recipient}/overview`}>
                  ({getAccountNickname(recipient)})
                </NavLink>
              </div>
              <div className="TopNavNotifications__time">1h ago</div>
            </div>
            <div className="TopNavNotifications__amount">+ {amount}</div>
          </div>
        </div>
      ));
    });
  };

  const renderUnreadNotificationsDot = (): ReactNode => {
    const unreadNotifications = menuNotifications.filter(({notificationTime}) => lastReadTime < notificationTime);
    return unreadNotifications.length ? (
      <span className="TopNavNotifications__unread-notifications-dot" onClick={handleBellClick} />
    ) : null;
  };

  const truncate = (str: string, size: number) => {
    return str.length <= size ? str : `${str.slice(0, size)}...`;
  };

  const updateLastReadTime = (): void => {
    const time = new Date().getTime();
    setLastReadTime(time);
  };

  return (
    <>
      <div className="TopNavNotifications__Icon-container">
        <Icon
          className={clsx('TopNavNotifications', {'TopNavNotifications--active': open})}
          icon={IconType.bell}
          onClick={handleBellClick}
          ref={iconRef}
        />
        {renderUnreadNotificationsDot()}
      </div>
      {open &&
        createPortal(
          <TopNavNotificationsMenu
            handleMenuClose={handleMenuClose}
            iconRef={iconRef}
            menuOpen={open}
            notifications={renderNotifications()}
            updateLastReadTime={updateLastReadTime}
          />,
          dropdownRoot,
        )}
    </>
  );
};

export default TopNavNotifications;
