import React, { useEffect, useState } from 'react';
import {
  Loading,
  Modal,
  Table,
  Text,
  Button,
  Container,
  Col,
  Spacer,
  Tooltip,
  Badge,
} from '@geist-ui/react';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { useWalletAddresses, WalletAddressState } from '../../context';
import { AmmDexOperation, AmmOrder, RefundOperation } from 'ergo-dex-sdk';
import { useInterval } from '../../hooks/useInterval';
import { toast } from 'react-toastify';
import { exploreTx } from '../../utils/redirect';
import { isRefundableOperation } from '../../utils/ammOperations';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLinkAlt, faUndo } from '@fortawesome/free-solid-svg-icons';
import { useToggle } from '../../hooks/useToggle';
import { ConfirmRefundModal } from '../ConfirmRefundModal/ConfirmRefundModal';
import { truncate } from '../../utils/string';
import networkHistory from '../../services/networkHistory';

const content = {
  title: 'Transactions history',
  close: 'OK',
};

type HistoryModalProps = {
  open?: boolean;
  onClose?: () => void;
  onConnectWallet?: () => void;
  isWalletConnected?: boolean;
};

// eslint-disable-next-line react/display-name
const Content = React.memo(
  ({ operations }: { operations: AmmDexOperation[] | null }) => {
    const [open, handleOpen, handleClose] = useToggle(false);

    if (operations === null) {
      return <Loading>Fetching operations...</Loading>;
    }

    if (operations?.length === 0) {
      return <Text p>No operations</Text>;
    }

    function renderOrder({ boxId, status, txId, order }: AmmOrder) {
      return {
        boxId: (
          <CopyToClipboard text={boxId} onCopy={() => toast.info('Copied')}>
            <span style={{ cursor: 'pointer' }}>{truncate(boxId)}</span>
          </CopyToClipboard>
        ),
        status,
        txId: (
          <CopyToClipboard text={txId} onCopy={() => toast.info('Copied')}>
            <span style={{ cursor: 'pointer' }}>{truncate(txId)}</span>
          </CopyToClipboard>
        ),
        type: <Badge type="secondary">{order.type}</Badge>,
        operation: (
          <Container>
            <Col>
              <Tooltip text={'View on Explorer'} type="dark">
                <Button
                  icon={<FontAwesomeIcon icon={faExternalLinkAlt} />}
                  auto
                  size="small"
                  onClick={() => exploreTx(txId)}
                />
              </Tooltip>
            </Col>
            {isRefundableOperation(status) && (
              <>
                <Spacer x={0.2} />
                <Col>
                  <Tooltip text={'Refund transaction'} type="dark">
                    <Button
                      auto
                      size="small"
                      onClick={handleOpen}
                      icon={<FontAwesomeIcon icon={faUndo} />}
                    />
                  </Tooltip>
                </Col>
                <ConfirmRefundModal
                  txId={txId}
                  open={open}
                  onClose={handleClose}
                />
              </>
            )}
          </Container>
        ),
      };
    }

    function renderRefund({ status, txId }: RefundOperation) {
      return {
        boxId: '',
        status,
        txId: (
          <CopyToClipboard text={txId} onCopy={() => toast.info('Copied')}>
            <span style={{ cursor: 'pointer' }}>{truncate(txId)}</span>
          </CopyToClipboard>
        ),
        operation: (
          <Container>
            <Col>
              <Tooltip text={'View on Explorer'} type="dark">
                <Button
                  icon={<FontAwesomeIcon icon={faExternalLinkAlt} />}
                  auto
                  size="small"
                  onClick={() => exploreTx(txId)}
                />
              </Tooltip>
            </Col>
          </Container>
        ),
      };
    }

    const formattedOperations = operations.map((op) => {
      if (op.type === 'order') {
        return renderOrder(op);
      } else if (op.type === 'refund') {
        return renderRefund(op);
      }
    });

    return (
      <Table data={formattedOperations}>
        <Table.Column prop="boxId" label="Box ID" />
        <Table.Column prop="txId" label="TX ID" />
        <Table.Column prop="type" label="Type" />
        <Table.Column prop="status" label="Status" />
        <Table.Column prop="operation" />
      </Table>
    );
  },
);

export const HistoryModal = (props: HistoryModalProps): JSX.Element => {
  const { open = false, onClose } = props;
  const [operations, setOperations] = useState<AmmDexOperation[] | null>(null);

  const walletAddresses = useWalletAddresses();

  useEffect(() => {
    if (
      !(
        walletAddresses.state === WalletAddressState.LOADED &&
        operations === null
      )
    )
      return;

    networkHistory
      .getAllByAddresses(walletAddresses.addresses, 20)
      .then((op) => {
        setOperations(op);
      });
  }, [walletAddresses, operations]);

  useInterval(() => {
    if (
      !(
        walletAddresses.state === WalletAddressState.LOADED &&
        operations === null
      )
    )
      return;

    networkHistory
      .getAllByAddresses(walletAddresses.addresses, 20)
      .then(setOperations);
  }, 10 * 1000);

  return (
    <Modal open={open} onClose={onClose} width="1000px">
      <Modal.Title>{content.title}</Modal.Title>
      <Modal.Content>
        <Content operations={operations} />
      </Modal.Content>
      <Modal.Action onClick={onClose}>{content.close}</Modal.Action>
    </Modal>
  );
};
